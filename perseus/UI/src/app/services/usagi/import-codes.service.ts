import { Injectable } from '@angular/core';
import { Column } from '@models/grid/grid';
import { Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { HttpClient } from '@angular/common/http';
import { CodeMapping, withoutTargetConcepts } from '@models/code-mapping/code-mapping';
import { CodeMappingParams } from '@models/code-mapping/code-mapping-params';
import { Code } from '@models/code-mapping/code';
import { ScoredConcept } from '@models/code-mapping/scored-concept';
import { columnsFromSourceCode, ImportCodesState } from '@models/code-mapping/import-codes-state';
import { FilterValue } from '@models/filter/filter';
import { defaultSearchConceptFilters, SearchConceptFilters } from '@models/code-mapping/search-concept-filters';
import { StateService } from '@services/state/state.service';
import { usagiUrl } from '@app/app.constants'
import { Conversion } from '@models/conversion/conversion'

const initialState: ImportCodesState = {
  codes: null,
  columns: null,
  mappingParams: null,
  codeMappings: null,
  filters: defaultSearchConceptFilters(),
  isExisted: false,
  conversionId: null
}

@Injectable()
export class ImportCodesService implements StateService {

  private state: ImportCodesState

  constructor(private httpClient: HttpClient) {
    this.state = {...initialState}
  }

  get codes(): Code[] {
    return this.state.codes
  }

  get conversionId(): number {
    return this.state.conversionId
  }

  get columns(): Column[] {
    return this.state.columns
  }

  get mappingParams(): CodeMappingParams {
    return this.state.mappingParams
  }

  set mappingParams(mappingParams: CodeMappingParams) {
    this.state.mappingParams = mappingParams
  }

  get codeMappings(): CodeMapping[] {
    return this.state.codeMappings
  }

  set codeMappings(codeMapping: CodeMapping[]) {
    this.state.codeMappings = codeMapping
  }

  get sourceNameColumn(): string {
    return this.state.mappingParams?.sourceName
  }

  set vocabulary(vocabulary: ImportCodesState) {
    this.state = {...vocabulary}
  }

  get imported(): boolean {
    return !!this.codes && !!this.columns
  }

  get filters(): SearchConceptFilters {
    return this.state.filters
  }

  set filters(filters: SearchConceptFilters) {
    this.state.filters = filters
  }

  get isExisted() {
    return this.state.isExisted
  }

  get vocabularyName() {
    return this.state.vocabularyName
  }

  /**
   * Parse CSV file to json array on server
   */
  loadCsv(csv: File, delimiter = ','): Observable<Code[]> {
    const formData = new FormData()
    formData.append('file', csv)
    formData.append('delimiter', delimiter)

    return this.httpClient.post<Code[]>(`${usagiUrl}/code-mapping/load-csv`, formData)
      .pipe(
        tap(sourceCodes => {
          this.state.codes = sourceCodes
          this.state.columns = columnsFromSourceCode(sourceCodes[0])
        })
      )
  }

  calculateScore(): Observable<Conversion> {
    const body = {
      params: this.mappingParams,
      codes: this.codes,
      filters: this.filters
    }
    const url = `${usagiUrl}/code-mapping/launch?conversionId=${this.conversionId}`
    return this.httpClient.post<Conversion>(url, body)
      .pipe(
        tap(conversion => this.state.conversionId = conversion.id)
      )
  }

  calculatingScoresInfoWithLogs(conversionId: number): Observable<Conversion> {
    return this.httpClient.get<Conversion>(`${usagiUrl}/code-mapping/status?conversionId=${conversionId}`)
  }

  getCodesMappings(): Observable<CodeMapping[]> {
    return this.httpClient.get<CodeMapping[]>(`${usagiUrl}/code-mapping/result?conversionId=${this.conversionId}`)
      .pipe(
        map(codeMappings => codeMappings.map(codeMapping =>
          codeMapping.targetConcepts?.length ? codeMapping : withoutTargetConcepts(codeMapping)
        )),
        tap(codeMappings => this.state.codeMappings = codeMappings)
      )
  }

  /**
   * Get all mappings for concrete term, sorted by match score
   * @param term - source name column
   * @param filters - filters for search
   * @param sourceAutoAssignedConceptIds - sourceConcept.sourceAutoAssignedConceptIds
   */
  getSearchResultByTerm(term: string, filters: SearchConceptFilters, sourceAutoAssignedConceptIds: number[]): Observable<ScoredConcept[]> {
    const body = {term, sourceAutoAssignedConceptIds, filters}
    return this.httpClient.post<ScoredConcept[]>(`${usagiUrl}/code-mapping/search-by-term`, body)
  }

  saveCodes(name): Observable<void> {
    const body = {
      name,
      codes: this.codes,
      mappingParams: this.mappingParams,
      codeMappings: this.codeMappings,
      filters: this.filters,
      conversionId: this.conversionId
    }
    return this.httpClient.post<void>(`${usagiUrl}/code-mapping/save?conversionId=${this.conversionId}`, body)
  }

  /**
   * Concepts classes, Vocabularies, Domains filters
   */
  fetchFilters(): Observable<{[key: string]: FilterValue[]}> {
    return this.httpClient.get<{[key: string]: string[]}>(`${usagiUrl}/filters`)
      .pipe(
        map(res => {
          const parsed: {[key: string]: FilterValue[]} = {}
          Object.keys(res).forEach(key => parsed[key] = res[key].map(it => ({
            name: it,
            checked: false,
            disabled: false
          })))
          return parsed
        })
      )
  }

  reset(state?: ImportCodesState) {
    this.state = state ? {...state} : {...initialState};
  }

  cancelCalculateScoresByCsvCodes(): Observable<void> {
    return this.httpClient.get<void>(`${usagiUrl}/code-mapping/abort?conversionId=${this.conversionId}`)
  }
}
