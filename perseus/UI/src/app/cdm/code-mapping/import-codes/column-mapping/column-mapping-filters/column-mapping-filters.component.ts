import { Component, Input, OnInit } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { getFilters } from '@models/code-mapping/filters';
import { ImportCodesService } from '@services/usagi/import-codes.service';
import { Filter } from '@models/filter/filter';
import { SearchConceptFilters } from '@app/models/code-mapping/search-concept-filters';

@Component({
  selector: 'app-column-mapping-filters',
  templateUrl: './column-mapping-filters.component.html',
  styleUrls: ['./column-mapping-filters.component.scss']
})
export class ColumnMappingFiltersComponent implements OnInit {

  @Input()
  form: FormGroup

  dropdownFilters: Filter[]

  constructor(private importCodesService: ImportCodesService) { }

  ngOnInit(): void {
    this.initFilters()
  }

  private initFilters() {
    this.importCodesService.fetchFilters()
      .subscribe(result => {
        this.dropdownFilters = getFilters()
        Object.keys(result).forEach(key =>
          this.dropdownFilters.find(filter => filter.field === key).values = result[key]
        )
      })
  }

  onChangeValue(value: string) {
    const searchConceptFilters = this.form.value as SearchConceptFilters;

    this.form.get('filterByConceptClass').setValue(searchConceptFilters.conceptClasses.length > 0)
    this.form.get('filterByVocabulary').setValue(searchConceptFilters.vocabularies.length > 0)
    this.form.get('filterByDomain').setValue(searchConceptFilters.domains.length > 0)
  }
}
