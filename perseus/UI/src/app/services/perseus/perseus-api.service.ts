import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { createNoCacheHeaders } from '@utils/http-headers';
import { perseusApiUrl } from '@app/app.constants'
import { ScanReportRequest } from '@models/perseus/scan-report-request'
import { UploadScanReportResponse } from '@models/perseus/upload-scan-report-response'
import { TableInfoResponse } from '@models/perseus/table-info-response'
import { UploadEtlMappingResponse } from '@models/perseus/upload-etl-mapping-response'
import { GenerateEtlArchiveRequest } from '@models/perseus/generate-etl-archive-request'
import { ViewSqlResponse } from '@models/perseus/view-sql-response'
import { EtlMapping } from '@models/perseus/etl-mapping'

@Injectable()
export class PerseusApiService {

  constructor(private httpClient: HttpClient) {}

  uploadScanReport(scanReportFile: File, cdmVersion?: string): Observable<UploadScanReportResponse> {
    const formData: FormData = new FormData();
    formData.append('scanReportFile', scanReportFile, scanReportFile.name);
    if (cdmVersion) {
      formData.append('cdmVersion', cdmVersion)
    }
    return this.httpClient.post<UploadScanReportResponse>(`${perseusApiUrl}/upload_scan_report`, formData);
  }

  uploadEtlMapping(etlMappingArchiveFile: File): Observable<UploadEtlMappingResponse> {
    const formData: FormData = new FormData();
    formData.append('etlArchiveFile', etlMappingArchiveFile, etlMappingArchiveFile.name);
    return this.httpClient.post<UploadEtlMappingResponse>(`${perseusApiUrl}/upload_etl_mapping`, formData)
  }

  createSourceSchemaByScanReport(scanReport: ScanReportRequest): Observable<UploadScanReportResponse> {
    return this.httpClient.post<UploadScanReportResponse>(`${perseusApiUrl}/create_source_schema_by_scan_report`, scanReport);
  }

  setCdmVersionToEtlMapping(etlMappingId: number, cdmVersion: string) {
    return this.httpClient.patch<EtlMapping>(`${perseusApiUrl}/etl-mapping/cdm-version`, {etlMappingId, cdmVersion})
  }

  generateEtlMappingArchive(request: GenerateEtlArchiveRequest): Observable<Blob> {
    const headers = createNoCacheHeaders()
    const url = `${perseusApiUrl}/generate_etl_mapping_archive`
    return this.httpClient.post(url, request, {headers, responseType: 'blob'})
  }

  getCDMVersions(): Observable<string[]> {
    return this.httpClient.get<string[]>(`${perseusApiUrl}/get_cdm_versions`);
  }

  getTargetData(version: string): Observable<TableInfoResponse[]> {
    return this.httpClient.get<any>(`${perseusApiUrl}/get_cdm_schema?cdm_version=${version}`);
  }

  getColumnInfo(etlMappingId: number, tableName: string, columnName: string): Observable<any> {
    return this.httpClient.get<any>(`${perseusApiUrl}/get_column_info?etl_mapping_id=${etlMappingId}&table_name=${tableName}&column_name=${columnName}`);
  }

  viewSql(sql: {sql: string}): Observable<ViewSqlResponse[]> {
    return this.httpClient.post<ViewSqlResponse[]>(`${perseusApiUrl}/view_sql`, sql);
  }

  validateSql(sql: any): Observable<any> {
    return this.httpClient.post(`${perseusApiUrl}/validate_sql`, sql);
  }
}
