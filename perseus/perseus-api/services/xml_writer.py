import math
import os
import re
import pandas as pd
import zipfile

from itertools import groupby
from shutil import rmtree
from pathlib import Path
from db import user_schema_db
from services import lookup_service
from utils import InvalidUsage
from utils.exceptions import LookupNotFoundById
from utils.similar_names_map import similar_names_map
from utils.constants import GENERATE_ETL_XML_PATH,\
                            GENERATE_CDM_XML_ARCHIVE_PATH,\
                            GENERATE_CDM_XML_ARCHIVE_FILENAME,\
                            CDM_XML_ARCHIVE_FORMAT,\
                            GENERATE_LOOKUP_SQL_PATH,\
                            PREDEFINED_LOOKUPS_PATH,\
                            INCOME_LOOKUPS_PATH,\
                            GENERATE_BATCH_SQL_PATH
from xml.etree.ElementTree import Element, SubElement, tostring, ElementTree
from xml.dom import minidom


def _convert_underscore_to_camel(word: str):
    """get tag name from target table names"""
    return ''.join(x.capitalize() for x in word.split('_'))


def _replace_with_similar_name(name: str):
    new_name = similar_names_map.get(name)
    return new_name if new_name else name


def _prettify(elem):
    """Return a pretty-printed XML string for the Element."""
    raw_string = tostring(elem, 'utf-8')
    reparsed = minidom.parseString(raw_string)
    return reparsed.toprettyxml(indent="  ")


def add_concept_id_data(field, alias, sql, counter):
    match_str = f' as {alias},'
    value = f'{field}{match_str}'
    if counter is not None and not math.isnan(counter):
        sql += value.replace(',', f'_{int(counter) + 1},')
    else:
        sql += value
    return sql


def check_lookup_tables(tables):
    for table in tables:
        if table.lower() in ('location', 'care_site', 'provider'):
            return True
    return False


def unique(sequence):
    seen = []
    for item in sequence:
        if item not in seen:
            seen.append(item)
    return seen


def prepare_sql(current_user, mapping_items, source_table, views, target_tables):
    """prepare sql from mapping json"""
    required_fields = ['source_field', 'sql_field', 'sql_alias', 'targetCloneName', 'concept_id', 'sqlTransformation']

    def get_sql_data_items(mapping_items_, source_table_):
        """return unique all required fields to prepare sql"""
        all_fields = []
        mapping_items_for_table = mapping_items_[mapping_items_.source_table == source_table_]
        mapping_data = mapping_items_for_table.get('mapping', pd.Series())
        condition_data = mapping_items_for_table.get('condition', pd.Series())
        lookup = mapping_items_for_table.get('lookup', pd.Series())

        if isinstance(lookup, pd.Series):
            lookup = lookup.fillna('')
            lookup_data = lookup.map(
                lambda el_list: list(map(lambda el: el.get('sql_field', ''), el_list))
            ).map(
                lambda li: [item for sublist in li for item in sublist]
            )
        else:
            lookup_data = lookup

        result_data = pd.concat([mapping_data, condition_data, lookup_data]).fillna('')

        for _, row_ in result_data.iteritems():
            all_fields += [{k: dic.get(k) for k in required_fields} for dic in row_]

        all_fields_unique = unique(all_fields)

        return pd.DataFrame(all_fields_unique)

    data_ = get_sql_data_items(mapping_items, source_table)
    fields = data_.loc[:, required_fields].sort_values(by=['targetCloneName', 'concept_id'])
    sql = 'SELECT '
    mapped_to_person_id_field = ''
    target_clone_name = ""
    for _, row in fields.iterrows():
        source_field = row['sql_field']
        target_field = row['sql_alias']
        sql_transformation: str = row.get("sqlTransformation")
        if target_clone_name != row['targetCloneName']:
            target_clone_name = row['targetCloneName']
        if not row['targetCloneName']:
            clone = ""
        else:
            clone = f"{row['targetCloneName']}_"
        if target_field == 'person_id':
            mapped_to_person_id_field = source_field if not sql_transformation \
                else sql_transformation.replace(f' as {target_field}', "")
        if not source_field:
            sql += f"{row['source_field']},\n"
        else:
            if is_concept_id(target_field):
                sql = add_concept_id_data(source_field, f"{clone}{target_field}", sql, row['concept_id'])
            elif is_source_value(target_field):
                sql = add_concept_id_data(source_field, f"{clone}{target_field}", sql, row['concept_id'])
            elif is_type_concept_id(target_field):
                sql = add_concept_id_data(
                    source_field,
                    f"{clone}{target_field}",
                    sql,
                    row['concept_id']
                )
            elif is_source_concept_id(target_field):
                sql = add_concept_id_data(
                    source_field,
                    f"{clone}{target_field}",
                    sql,
                    row['concept_id']
                )
            else:
                sql += f"{source_field} as {clone}{target_field},"
            sql += '\n'
    sql = f'{sql[:-2]}\n'
    view = None
    if views:
        view = views.get(source_table, None)

    if view:
        view = add_schema_names(
            'SELECT table_name FROM information_schema.tables WHERE table_schema=\'{0}\''.format(current_user), view)
        sql = f'WITH {source_table} AS (\n{view})\n{sql}FROM {source_table}'
    else:
        sql += 'FROM {sc}.' + source_table
    if not check_lookup_tables(target_tables):
        sql += '\n JOIN {sc}._CHUNKS CH ON CH.CHUNKID = {0}'
        if mapped_to_person_id_field:
            sql += f' AND {mapped_to_person_id_field} = CH.PERSON_ID'
    return sql


# method adds {sc} to table names used in join and from clauses avoiding those cases when words similar to table names areinside double/single quotes
def add_schema_names(sql, view_sql):
    cursor = user_schema_db.execute_sql(sql)
    for row in cursor.fetchall():
        view_sql = re.sub(
            f"(?i)join {row[0]} (?!(?=[^(\'|\")]*\"[^(\'|\")]*(?:(\'|\")[^(\'|\")]*(\'|\")[^(\'|\")]*)*$))",
            f'join {{sc}}.{row[0]} ', view_sql)
        view_sql = re.sub(
            f"(?i)from {row[0]} (?!(?=[^(\'|\")]*\"[^(\'|\")]*(?:(\'|\")[^(\'|\")]*(\'|\")[^(\'|\")]*)*$))",
            f'from {{sc}}.{row[0]} ', view_sql)
        view_sql = re.sub(
            f"(?i)join {row[0]}\)(?!(?=[^(\'|\")]*\"[^(\'|\")]*(?:(\'|\")[^(\'|\")]*(\'|\")[^(\'|\")]*)*$))",
            f'join {{sc}}.{row[0]})', view_sql)
        view_sql = re.sub(
            f"(?i)from {row[0]}\)(?!(?=[^(\'|\")]*\"[^(\'|\")]*(?:(\'|\")[^(\'|\")]*(\'|\")[^(\'|\")]*)*$))",
            f'from {{sc}}.{row[0]})', view_sql)

    return view_sql


def create_user_directory(path, username):
    directory = Path(path, username)
    if not directory.is_dir():
        directory.mkdir(exist_ok=True, parents=True)


def is_concept_id(field: str):
    field = field.lower()
    return field.endswith('concept_id') and not (
                is_source_concept_id(field) or is_type_concept_id(field) or is_source_concept_id(field))


def is_source_value(field: str):
    field = field.lower()
    return field.endswith('source_value')


def is_type_concept_id(field: str):
    field = field.lower()
    return field.endswith('type_concept_id')


def is_source_concept_id(field: str):
    field = field.lower()
    return field.endswith('source_concept_id')


def prepare_concepts_tag(concept_tags, concepts_tag, domain_definition_tag, concept_tag_key, target_field):
    if concepts_tag is None:
        concepts_tag = SubElement(domain_definition_tag, 'Concepts')

    if concept_tags.get(concept_tag_key, None) is None:
        concept_tag = SubElement(
            concepts_tag,
            'Concept',
            attrib={'name': f"{concept_tag_key.capitalize()}ConceptId"}
        )
        concept_tags[concept_tag_key] = concept_tag

    return concepts_tag


def is_mapping_contains(field, key, mapping, concept_id, check = True):
    for row in mapping:
        lookup_name = row.get('lookup', None)
        if lookup_name and 'name' in lookup_name:
                lookup_name = lookup_name['name']
        target_field = row['target_field']
        if target_field.startswith('value_as'):
            continue
        if target_field == f"{field}_{key}" and row['concept_id'] == concept_id and 'checked' not in row:
            sql = ''
            if 'sqlTransformation' in row:
                sql = row['sqlTransformation']
            if 'sql_field' in row:
                constant = row['sql_field']
            result = {'row': row, 'source': row['source_field'], 'sql': sql, 'constant': constant, 'lookup_name': lookup_name}
            if check:
                row['checked'] = True
            return result
    return None


def number_of_fields_contained(field, key, mapping):
    fields_counter = 0
    for row in mapping:
        target_field = row['target_field']
        if target_field.startswith('value_as'):
            continue
        if target_field == field.replace('concept_id', key):
            fields_counter += 1
    return fields_counter


def get_mapping_source_values(mapping):
    source_values = []
    for row in mapping:
        target_field = row['target_field']
        if target_field.startswith('value_as'):
            continue

        if target_field.endswith('source_value'):
            if target_field in source_values:
                continue
            source_values.append(target_field)
    return source_values


def generate_bath_sql_file(current_user, mapping, source_table, views):
    view = ''
    sql = 'SELECT DISTINCT {person_id} as person_id, {person_source} as person_source FROM '
    if views:
        view = views.get(source_table, None)

    if view:
        view = view.replace('from ', 'from {sc}.').replace('join ', 'join {sc}.')
        sql = f'WITH {source_table} AS (\n{view})\n{sql}'
        sql += '{table} ORDER BY 1'
    else:
        sql += '{sc}.{table} ORDER BY 1'
    sql = sql.replace('{table}', source_table)
    for row in mapping:
        source_field = row['source_field']
        target_field = row['target_field']
        if target_field == 'person_id':
            sql = sql.replace('{person_id}', source_field)
            transformation = row.get('sqlTransformation')
            if transformation:
                sql = apply_sql_transformation_to_text(transformation, source_field, target_field, '', sql)
        if target_field == 'person_source_value':
            sql = sql.replace('{person_source}', source_field)
            transformation = row.get('sqlTransformation')
            if transformation:
                sql = apply_sql_transformation_to_text(transformation, source_field, target_field, '', sql)
    create_user_directory(GENERATE_BATCH_SQL_PATH, current_user)
    with open(Path(GENERATE_BATCH_SQL_PATH, current_user, 'Batch.sql'), mode='w') as f:
        f.write(sql)


def clear(username: str):
    xml = Path(GENERATE_ETL_XML_PATH, username)
    lookup = Path(GENERATE_LOOKUP_SQL_PATH, username)
    batch_sql = Path(GENERATE_BATCH_SQL_PATH, username)
    if xml.is_dir():
        rmtree(xml)
    if lookup.is_dir():
        rmtree(lookup)
    if batch_sql.is_dir():
        rmtree(batch_sql)


def get_xml(current_user, json_):
    clear(current_user)
    result = {}
    previous_target_table = ''
    previous_source_table = ''
    domain_tag = ''
    mapping_items = pd.DataFrame(json_['mapping_items'])
    source_tables = pd.unique(mapping_items.get('source_table'))
    views = json_.get('views', None)

    for source_table in source_tables:
        query_definition_tag = Element('QueryDefinition')
        query_tag = SubElement(query_definition_tag, 'Query')
        target_tables = mapping_items.loc[mapping_items['source_table'] == source_table].fillna('')
        sql = prepare_sql(current_user, mapping_items, source_table, views,
                          pd.unique(target_tables.get('target_table')))
        query_tag.text = sql

        skip_write_file = False

        for _, record_data in target_tables.iterrows():
            mapping = record_data.get('mapping')
            target_table = record_data.get('target_table')

            tag_name = _convert_underscore_to_camel(target_table)

            if mapping is None:
                continue

            if previous_target_table != target_table or previous_source_table != source_table:
                domain_tag = SubElement(query_definition_tag, tag_name)

            clone_key = lambda a: a.get('targetCloneName')
            clone_groups = groupby(sorted(mapping, key=clone_key), key=clone_key)

            for key, group in clone_groups:
                if key != "":
                    clone_key = f"{key}_"
                else:
                    clone_key = ""
                groupList = list(group)
                domain_definition_tag = SubElement(domain_tag, f'{tag_name}Definition')
                condition_text = groupList[0].get('condition')
                if condition_text:
                    condition_tag = SubElement(domain_definition_tag, 'Condition')
                    condition_tag.text = condition_text
                fields_tags = {}

                concepts_tag = None
                concept_tags = {}
                definitions = []

                create_user_directory(GENERATE_LOOKUP_SQL_PATH, current_user)
                generated_lookups_names = []
                for row in groupList:
                    lookup_data = row.get('lookup', None)

                    sql_transformation = row.get('sqlTransformation', None)
                    target_field = row.get('target_field', None)
                    concept_tag_key = target_field.replace('_concept_id', '') if is_concept_id(target_field) else \
                        target_field.replace('_source_value', '') if is_source_value(target_field) else \
                            target_field.replace('_source_concept_id', '') if is_source_concept_id(target_field) else \
                                target_field.replace('_type_concept_id', '') if is_type_concept_id(
                                    target_field) else target_field

                    if lookup_data and not target_field.endswith('source_concept_id'):
                        if 'name' in lookup_data:
                            lookup_name = lookup_data['name']
                            is_legacy_lookup = False
                        else:
                            lookup_name = lookup_data
                            is_legacy_lookup = True

                        if lookup_name not in generated_lookups_names:
                            if is_legacy_lookup:
                                lookup_service.generate_lookup_file_legacy(lookup_name, current_user)
                            else:
                                try:
                                    lookup_service.generate_lookup_file(lookup_data, current_user)
                                except LookupNotFoundById as e:
                                    source_field = row.get('source_field', None)
                                    raise InvalidUsage(f'{e.message}\n'
                                                       f'Please, change \'{lookup_name}\' lookup '
                                                       f'for {source_table} - {target_table} tables '
                                                       f'and {source_field} - {target_field} fields', base=e)

                            concepts_tag = prepare_concepts_tag(
                                concept_tags,
                                concepts_tag,
                                domain_definition_tag,
                                concept_tag_key,
                                target_field
                            )
                            concept_id_mapper = SubElement(concept_tags[concept_tag_key], 'ConceptIdMapper')
                            mapper = SubElement(concept_id_mapper, 'Mapper')
                            lookup = SubElement(mapper, 'Lookup')
                            lookup.text = lookup_name
                            generated_lookups_names.append(lookup_data)

                    source_field = row['source_field']
                    sql_alias = row['sql_alias']
                    target_field = row['target_field']
                    if 'concept_id' in row:
                        concept_id = row['concept_id']

                    if is_concept_id(target_field) or is_source_value(target_field) or is_source_concept_id(
                            target_field) or is_type_concept_id(target_field):
                        concepts_tag = prepare_concepts_tag(
                            concept_tags,
                            concepts_tag,
                            domain_definition_tag,
                            concept_tag_key,
                            target_field
                        )

                        fields_tag = None
                        if fields_tags.get(concept_tag_key, None) is not None:
                            if 'checked' not in row:
                                attrib = add_fields_for_concept(concept_id, concept_tag_key, groupList, clone_key, query_tag)
                                SubElement(fields_tags[concept_tag_key], 'Field', attrib)

                        else:
                            concepts_tag = prepare_concepts_tag(
                                concept_tags,
                                concepts_tag,
                                domain_definition_tag,
                                concept_tag_key,
                                target_field
                            )

                            fields_tag = SubElement(concept_tags[concept_tag_key], 'Fields')

                            attrib = add_fields_for_concept(concept_id, concept_tag_key, groupList, clone_key, query_tag)

                            SubElement(fields_tag, 'Field', attrib)

                        if fields_tags.get(concept_tag_key, None) is None:
                            fields_tags[concept_tag_key] = fields_tag
                    else:
                        if target_field not in definitions:
                            v = SubElement(
                                domain_definition_tag,
                                _convert_underscore_to_camel(_replace_with_similar_name(target_field))
                            )
                            v.text = f'{clone_key}{sql_alias}' if sql_alias else source_field

                            definitions.append(target_field)
                            apply_sql_transformation_to_xml_tag_if_needed(
                                sql_transformation,
                                source_field,
                                target_field,
                                clone_key,
                                query_tag
                            )

                previous_target_table = target_table
                previous_source_table = source_table
                if target_table == 'person':
                    generate_bath_sql_file(current_user, groupList, source_table, views)

                if target_table.lower() in ('location', 'care_site', 'provider'):
                    skip_write_file = True
                    write_xml(current_user, query_definition_tag, f'L_{target_table}', result)

        if skip_write_file:
            continue

        write_xml(current_user, query_definition_tag, source_table, result)
    return result


def add_concept_field(attrib, attrib_key_name, concept_tag_key, field_type, groupList, concept_id, counter, clone_key,
                      query_tag):
    concept_id_source_field = is_mapping_contains(concept_tag_key, field_type, groupList,
                                                  concept_id)
    if concept_id_source_field is not None:
        if field_type == 'concept_id' and concept_id_source_field['lookup_name']:
            attrib_key_name = 'key'
        attrib[attrib_key_name] = f"{clone_key}{concept_tag_key}_{field_type}{counter}"
        apply_sql_transformation_to_xml_tag_if_needed(
            concept_id_source_field['sql'],
            concept_id_source_field['source'],
            f"{concept_tag_key}_{field_type}",
            clone_key,
            query_tag
        )
        return concept_id_source_field['source']
    else:
        return ''


def add_fields_for_concept(concept_id, concept_tag_key, groupList, clone_key, query_tag):
    attrib = {}
    if concept_id is not None:
        counter = f'_{concept_id + 1}'
    else:
        counter = ''
    concept_id_field_name = add_concept_field(attrib, 'conceptId', concept_tag_key, 'concept_id', groupList, concept_id,
                      counter, clone_key, query_tag)
    source_concept_id_field = is_mapping_contains(concept_tag_key, 'source_concept_id', groupList,
                                                  concept_id, False)
    source_concept_id_field_name = get_source_concept_id_field_name(source_concept_id_field)
    if concept_id_field_name != source_concept_id_field_name:
        add_concept_field(attrib, 'sourceConceptId', concept_tag_key, 'source_concept_id', groupList,
                          concept_id, counter, clone_key, query_tag)
    else:
        if source_concept_id_field and 'row' in source_concept_id_field:
            source_concept_id_field['row']['checked'] = True
    add_concept_field(attrib, 'sourceKey', concept_tag_key, 'source_value', groupList, concept_id,
                      counter, clone_key, query_tag)
    add_concept_field(attrib, 'typeId', concept_tag_key, 'type_concept_id', groupList,
                      concept_id, counter, clone_key, query_tag)
    return attrib


def get_source_concept_id_field_name(source_concept_id_field):
    if source_concept_id_field:
        if source_concept_id_field['source']:
            source_concept_id_field_name = source_concept_id_field['source']
        else:
            source_concept_id_field_name = source_concept_id_field['constant']
    else:
        source_concept_id_field_name = ''
    return source_concept_id_field_name


def apply_sql_transformation_to_xml_tag_if_needed(sql_transformation: str or None,
                                                  source_field: str,
                                                  target_field: str,
                                                  clone_key: str,
                                                  query_tag: Element):
    if sql_transformation:
        sql = query_tag.text
        query_tag.text = apply_sql_transformation_to_text(
            sql_transformation,
            source_field,
            target_field,
            clone_key,
            sql
        )


def apply_sql_transformation_to_text(sql_transformation: str,
                                     source_field: str,
                                     target_field: str,
                                     clone_key: str,
                                     query: str) -> str:
    match_item = f"{source_field} as {clone_key}{target_field}"
    if sql_transformation not in query:
        query = query.replace(
            match_item,
            sql_transformation,
        )
    else:
        query = query.replace(f',\n{match_item},\n', ' ')
        query = query.replace(f',\n{match_item}\n', ' ')

    return query


def write_xml(current_user, tag, filename, result):
    xml = ElementTree(tag)
    create_user_directory(GENERATE_ETL_XML_PATH, current_user)
    xml.write(GENERATE_ETL_XML_PATH / current_user / (filename + '.xml'))
    result.update({filename: _prettify(tag)})


def add_files_to_zip(zip_file, path: Path, directory: str):
    for root, _, files in os.walk(path):
        for file in files:
            zip_file.write(os.path.join(root, file), arcname=os.path.join(directory, file))


def zip_xml(username: str, filename: str):
    """add mapping XMLs and lookup sql's to archive"""
    create_user_directory(GENERATE_CDM_XML_ARCHIVE_PATH, username)
    with zipfile.ZipFile(GENERATE_CDM_XML_ARCHIVE_PATH / username / filename, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        add_files_to_zip(zip_file, Path(GENERATE_ETL_XML_PATH, username), "definitions")
        add_files_to_zip(zip_file, Path(GENERATE_LOOKUP_SQL_PATH, username), "lookups")

        batch_sql = Path(GENERATE_BATCH_SQL_PATH, username, 'Batch.sql')
        if os.path.isfile(batch_sql):
            zip_file.write(batch_sql, arcname='Batch.sql')