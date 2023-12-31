import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { ResetWarningData } from '@models/reset-warning-data'

@Component({
  selector: 'app-reset-warning',
  templateUrl: './reset-warning.component.html',
  styleUrls: [ './reset-warning.component.scss', '../cdm-version-dialog/cdm-version-dialog.component.scss' ]
})
export class ResetWarningComponent {
  constructor(@Inject(MAT_DIALOG_DATA) public data: ResetWarningData) {}
}
