import { Component, ElementRef, EventEmitter, OnInit, Output, ViewChild } from '@angular/core';
import { ImportCodesService } from '@services/usagi/import-codes.service';
import { ImportVocabulariesService } from '@services/usagi/import-vocabularies.service';
import { openErrorDialog, parseHttpError } from '@utils/error';
import { MatDialog } from '@angular/material/dialog';
import { SetDelimiterDialogComponent } from '@shared/set-delimiter-dialog/set-delimiter-dialog.component';
import { catchError, finalize, switchMap, takeUntil, tap } from 'rxjs/operators';
import { EMPTY } from 'rxjs';
import { Router } from '@angular/router';
import { codesRouter, mainPageRouter } from '@app/app.constants';
import { BaseComponent } from '@shared/base/base.component';
import { columnsFromSourceCode } from '@models/code-mapping/import-codes-state';
import { withLoading } from '@utils/loading';
import { RemoveVocabularyConfirmComponent } from '@code-mapping/import-codes/import-vocabulary/remove-vocabulary-confirm/remove-vocabulary-confirm.component';

@Component({
  selector: 'app-import-vocabulary',
  templateUrl: './import-vocabulary.component.html',
  styleUrls: [
    './import-vocabulary.component.scss',
    '../styles/column-mapping-panel.scss',
    '../styles/import-codes-wrapper.scss'
  ]
})
export class ImportVocabularyComponent extends BaseComponent implements OnInit {

  vocabularies: string[]

  visibleVocabCount = 3

  showOther = false;

  loading = false;

  cannotLoadVocabularies = false

  @ViewChild('csvInput', {static: true})
  csvInput: ElementRef

  @Output()
  import = new EventEmitter<void>()

  constructor(private importCodesService: ImportCodesService,
              private importVocabulariesService: ImportVocabulariesService,
              private dialogService: MatDialog,
              private router: Router) {
    super()
  }

  ngOnInit(): void {
    this.importVocabulariesService.nameList()
      .subscribe(
        vocabularies => this.vocabularies = [...vocabularies],
        error => {
          openErrorDialog(this.dialogService, 'Failed to load vocabularies', parseHttpError(error))
          this.vocabularies = []
          this.cannotLoadVocabularies = true
        }
      )
  }

  onShowOther() {
    this.showOther = !this.showOther
  }

  onImport() {
    this.csvInput.nativeElement.click()
  }

  onFileUpload(event: Event) {
    const csv = (event.target as HTMLInputElement).files[0]

    const ext = csv.name.split('.').pop().toLowerCase();

    if (ext !== 'csv' && ext !== 'txt') {
      openErrorDialog(this.dialogService, 'Failed to load CSV', 'File format not supported. Only .CSV or .TXT can be uploaded.')
      return EMPTY
    }

    if (csv) {
      this.dialogService.open(SetDelimiterDialogComponent, {
        panelClass: 'perseus-dialog',
        disableClose: true
      }).afterClosed()
        .pipe(
          takeUntil(this.ngUnsubscribe),
          tap(() => this.loading = true),
          switchMap(delimiter => {
            if (delimiter) {
              return this.importCodesService.loadCsv(csv, delimiter)
            } else {
              this.csvInput.nativeElement.value = null
              return EMPTY
            }
          }),
          catchError(error => {
            openErrorDialog(this.dialogService, 'Failed to load CSV', parseHttpError(error))
            this.csvInput.nativeElement.value = null
            return EMPTY
          }),
          finalize(() => this.loading = false)
        )
        .subscribe(
          () => this.import.emit()
        )
    }
  }

  onEdit(index: number) {
    const vocabularyName = this.vocabularies[index]
    this.importVocabulariesService.loadByName(vocabularyName)
      .subscribe(
        state => {
          this.importCodesService.reset({
            ...state,
            columns: columnsFromSourceCode(state.codes[0]),
            isExisted: true,
            vocabularyName
          })
          this.router.navigateByUrl(`${mainPageRouter + codesRouter}/mapping`)
        },
        error => openErrorDialog(this.dialogService, 'Failed to open Vocabulary', parseHttpError(error))
      )
  }

  onRemove(index: number) {
    const vocabulary = this.vocabularies[index]
    this.dialogService.open(RemoveVocabularyConfirmComponent, {
      panelClass: 'perseus-dialog',
      disableClose: true,
      data: vocabulary
    }).afterClosed()
      .pipe(
        switchMap(result => result
          ? this.importVocabulariesService.removeByName(vocabulary).pipe(withLoading(this))
          : EMPTY
        )
      )
      .subscribe(
        () => this.vocabularies = this.vocabularies.filter(vocab => vocab !== vocabulary),
        error => openErrorDialog(this.dialogService, 'Failed to remove Vocabulary', parseHttpError(error))
      )
  }
}
