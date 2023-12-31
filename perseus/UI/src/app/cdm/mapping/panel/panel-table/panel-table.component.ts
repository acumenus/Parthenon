import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  Input,
  OnInit,
  Renderer2,
  ViewChild
} from '@angular/core';
import { MatTable, MatTableDataSource } from '@angular/material/table';
import { takeUntil } from 'rxjs/operators';

import { CommentPopupComponent } from '@popups/comment-popup/comment-popup.component';
import { Area } from '@models/area';
import { IRow, Row, RowOptions } from '@models/row';
import { ITable } from '@models/table';
import { BridgeService } from '@services/bridge.service';
import { OverlayConfigOptions } from '@services/overlay/overlay-config-options.interface';
import { OverlayService } from '@services/overlay/overlay.service';
import { AddConstantPopupComponent } from '@popups/add-constant-popup/add-constant-popup.component';
import { StoreService } from '@services/store.service';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { MatDialog } from '@angular/material/dialog';
import { OpenSaveDialogComponent } from '@popups/open-save-dialog/open-save-dialog.component';
import { cloneDeep, uniq } from '@app/infrastructure/utility';
import { ErrorPopupComponent } from '@popups/error-popup/error-popup.component';
import * as fieldTypes from './similar-types.json';
import { DeleteWarningComponent } from '@popups/delete-warning/delete-warning.component';
import { moveItemInArray } from '@angular/cdk/drag-drop';
import { BaseComponent } from '@shared/base/base.component';
import * as conceptMap from '../../concept-fileds-list.json';
import { ConceptTransformationComponent } from '@mapping/concept-transformation/concept-transformation.component';
import { getConceptFieldType, toNoConceptRows } from '@utils/concept-util';
import { getConstantId } from '@utils/constant';
import { IConnection } from '@models/connection';
import { FilteredField } from '@models/filtered-fields'

@Component({
  selector: 'app-panel-table',
  templateUrl: './panel-table.component.html',
  styleUrls: ['./panel-table.component.scss'],
  animations: [
    trigger('detailExpand', [
      state('collapsed', style({height: '0px', minHeight: '0', visibility: 'hidden', display: 'none'})),
      state('expanded', style({height: '*', visibility: 'visible'})),
      transition('expanded <=> collapsed', animate('225ms cubic-bezier(0.4, 0.0, 0.2, 1)')),
    ]),
  ],
})
export class PanelTableComponent extends BaseComponent implements OnInit {
  @Input() tables: ITable[];
  @Input() table: ITable;
  @Input() tabIndex: number;
  @Input() oppositeTableId: number;
  @Input() oppositeTableName: string;
  @Input() filtered: string[];
  @Input() filteredFields: FilteredField;
  @Input() mappingConfig: string[][];
  @Input() createGroupElementId: string;

  @ViewChild('htmlElement', { read: ElementRef }) element: HTMLElement;
  @ViewChild('tableComponent', { static: true }) tableComponent: MatTable<IRow[]>;

  datasource: MatTableDataSource<IRow>;
  rowFocusedElements: any[] = [];
  fieldTypes = (fieldTypes as any).default as Map<string, string[]>;
  connectortype = {};
  expandedElement: any = undefined;
  groupDialogOpened = false;
  conceptFieldNames = (conceptMap as any).default;

  @Input()
  private selectedSourceTableId: number // store.selectedSourceTableId
  @Input()
  private selectedTargetTableId: number // store.selectedTargetTableId

  @Input()
  private sourceSimilarTableId: number; // store.sourceSimilarTableId
  @Input()
  private targetSimilarTableId: number; // store.targetSimilarTableId

  constructor(
    private bridgeService: BridgeService,
    private storeService: StoreService,
    private overlayService: OverlayService,
    private renderer: Renderer2,
    private chg: ChangeDetectorRef,
    private elementRef: ElementRef,
    private matDialog: MatDialog
  ) {
    super();
  }

  get displayedColumns() {
    return [ 'column_indicator', 'column_name', 'column_type', 'comments', 'remove_group' ];
  }

  get area() {
    return this.table.area;
  }

  get totalRowsNumber() {
    return this.table.rows.length;
  }

  get sourceNotSimilar() {
    return this.selectedSourceTableId !== this.sourceSimilarTableId
  }

  ngOnInit(): void {
    this.dataSourceInit(this.table.rows);
    this.bridgeService.refreshAll();

    this.bridgeService.removeConnection$
      .pipe(takeUntil(this.ngUnsubscribe))
      .subscribe(connection => {
        if (connection) {
          this.hideConnectorPin(connection, Area.Target);
        }
      });

    this.storeService.state$.subscribe(res => {
      if (res) {
        this.filteredFields = res.filteredFields ? res.filteredFields[ this.table.name ] : null;
      }
    });
  }

  @HostListener('document:click', [ '$event' ])
  onClick(event) {
    if (!event?.target || !this.rowFocusedElements || !this.rowFocusedElements.length) {
      return;
    }
    const clickedOutside = event.target.id !== this.createGroupElementId && !this.groupDialogOpened;
    if (clickedOutside) {
      this.unsetRowFocus();
    }
  }

  equals(name1: string, name2: string): boolean {
    return name1.toUpperCase() === name2.toUpperCase();
  }

  expandRow(row: Row) {
    this.expandedElement = this.expandedElement === row ? undefined : row;
    this.bridgeService.adjustArrowsPositions();
    this.refreshPanel();
  }

  isExpansionDetailRow = (i: number, row: IRow) => {
    return row.grouppedFields && row.grouppedFields.length;
  }

  checkExpanded(row: IRow) {
    return row === this.expandedElement ? 'expanded' : 'collapsed';
  }

  dataSourceInit(data: any[]) {
    this.datasource = new MatTableDataSource(
      data.filter((row: IRow) => row.visible)
    );
  }

  getDataSourceForExpandedPanel(detail: any) {
    return new MatTableDataSource(this.datasource.data.filter(item => item.name === detail.name)[ 0 ].grouppedFields);
  }

  isConstant(column: IRow): boolean {
    const isConceptTable = this.conceptFieldNames[this.table.name]?.includes(column.name)
    if (isConceptTable) {
      const concepts = this.storeService.state.concepts[`${this.table.name}|${this.oppositeTableName}`]
      if (!concepts) {
        return false
      }
      const conceptFieldType = getConceptFieldType(column.name);
      return concepts.conceptsList
        .filter(item => item.fields[conceptFieldType].constantSelected && item.fields[conceptFieldType].constant)
        .length > 0
    }
    const constId = getConstantId(this.selectedSourceTableId, column)
    const allConstKeys = Object.keys(this.bridgeService.constantsCache)
    const inArrowCache = !!allConstKeys.find(key => key === constId)

    return column.hasConstant && inArrowCache;
  }

  refreshPanel(event?: any) {
    this.dataSourceInit(this.table.rows);
    if (!event) {
      this.bridgeService.refreshAll();
    }
  }

  reorderRows(row: IRow) {
    const replacerowindex = this.table.rows.findIndex(selectedRow => selectedRow.name === row.name);
    moveItemInArray(this.table.rows, this.bridgeService.draggedRowIndex, replacerowindex);
    this.updateRowsIndexesAnsSaveChanges();
  }

  getAllPanelRowNames() {
    let existingRowNames = [];
    this.tables.forEach(tbl => {
      const tblRowNames = tbl.rows.reduce((prev, cur) => {
        prev.push(cur.name);
        return prev.concat(cur.grouppedFields.map(item => item.name));
      }, []);
      existingRowNames = existingRowNames.concat(tblRowNames);
    });
    return uniq(existingRowNames);
  }

  createGroup() {
    if (!this.validateGroupFields()) {
      return;
    }
    const existingRowNames = this.getAllPanelRowNames();
    this.groupDialogOpened = true;
    const matDialog = this.matDialog.open(OpenSaveDialogComponent, {
      closeOnNavigation: false,
      disableClose: true,
      panelClass: 'cdm-version-dialog',
      data: {
        header: 'Create Group',
        label: 'Name',
        okButton: 'Save',
        type: 'input',
        existingNames: existingRowNames,
        errorMessage: 'This name already exists'
      }
    });
    matDialog.afterClosed().subscribe(res => {
      if (res.action) {
        const fieldsToGroup = this.rowFocusedElements.map(item => item.id.replace(`${this.area}-`, ''));
        const groupType = this.table.rows.find(item => item.name === fieldsToGroup[ 0 ]).type;
        const groupRows = this.table.rows.filter(item => fieldsToGroup.includes(item.name)) as Row[];
        const rowOptions: RowOptions = {
          id: 0,
          tableId: this.table.id,
          tableName: this.table.name,
          name: res.value,
          type: groupType.indexOf('(') !== -1 ? groupType.substr(0, groupType.indexOf('(')) : groupType,
          isNullable: true,
          comments: [],
          uniqueIdentifier: false,
          area: Area.Source,
          grouppedFields: groupRows,
          visible: true
        };
        const groupRow = new Row(rowOptions);
        this.table.rows = this.table.rows.filter(item => !fieldsToGroup.includes(item.name));
        this.table.rows.unshift(groupRow);

        this.removeRowsFromSimilarTable(fieldsToGroup);
        this.updateRowsIndexesAnsSaveChanges();
      }
      this.groupDialogOpened = false;
    });
  }

  private validateGroupFields(groupType?: string): boolean {
    const linkedTargetTables = uniq(this.checkLinks());
    if (linkedTargetTables.length) {
      this.matDialog.open(ErrorPopupComponent, {
        data: {
          title: 'Grouping error',
          message: `You cannot add linked fields to Group. There are links in the following tables: ${linkedTargetTables.join(',').toUpperCase()}`
        },
        panelClass: 'perseus-dialog'
      });
    } else if (this.checkGrouppedFields()) {
      this.matDialog.open(ErrorPopupComponent, {
        data: {
          title: 'Grouping error',
          message: 'You cannot add grouped field to Group.'
        },
        panelClass: 'perseus-dialog'
      });
    } else if (this.checkDifferentTypes(groupType)) {
      this.matDialog.open(ErrorPopupComponent, {
        data: {
          title: 'Grouping error',
          message: 'You cannot add fields of different types to Group. Types should be similar.'
        },
        panelClass: 'perseus-dialog'
      });
    } else {
      return true;
    }
    return false;
  }

  checkLinks() {
    const linkedTables = [];
    this.rowFocusedElements.forEach(item =>
      this.storeService.state.target.forEach(tbl => {
        if (this.bridgeService.rowHasAnyConnection(this.table.rows.find(r => r.name === item.id.replace(`${this.area}-`, '')), this.area, tbl.id)) {
          linkedTables.push(tbl.name);
        }
      }));
    return linkedTables;
  }

  checkGrouppedFields() {
    return this.rowFocusedElements.some(item => this.table.rows.find(r => r.name === item.id.replace(`${this.area}-`, '')).grouppedFields.length);
  }

  checkDifferentTypes(groupType?: string) {
    let typesArray = [];
    if (groupType) {
      typesArray = Object.values(Object.fromEntries(Object.entries(this.fieldTypes)
        .filter(([ k, v ]) => v.includes(groupType.toUpperCase()))));
    } else {
      const firstGroupRowType = this.getTypeWithoutLength(
        this.rowFocusedElements[0].id.replace(`${this.area}-`, '')
      );
      typesArray = Object.values(this.fieldTypes)
        .filter((v) => v.includes(firstGroupRowType.toUpperCase()));
    }
    return this.rowFocusedElements.some(item => {
      const rowType = this.getTypeWithoutLength(item.id.replace(`${this.area}-`, '')).toUpperCase();
      return !typesArray[0].includes(rowType);
    });
  }

  private getTypeWithoutLength(rowName: string) {
    let rowType = this.table.rows.find(r => r.name === rowName).type;
    if (rowType.indexOf('(') !== -1) {
      rowType = rowType.substr(0, rowType.indexOf('('));
    }
    return rowType;
  }

  addRowToGroup(rows: IRow[]) {
    const group = rows[ 0 ];
    const focusedRowsNames = this.rowFocusedElements.map(item => item.id.replace(`${this.area}-`, ''));
    const rowsToAdd = this.table.rows.filter(item => focusedRowsNames.includes(item.name));
    if (!this.validateGroupFields(group.type)) {
      return;
    }
    rowsToAdd.forEach(rowToAdd => {
      const addedRowIndex = this.table.rows.findIndex(item => item.name === rowToAdd.name);
      this.table.rows.find(item => item.name === group.name).grouppedFields.splice(0, 0, rowToAdd);
      this.table.rows.splice(addedRowIndex, 1);
      this.bridgeService.saveChangesInGroup(group.tableName, this.table.rows);
      this.removeRowsFromSimilarTable([ rowToAdd.name ]);
    });
    this.refreshPanel();
  }

  removeGroup(row: IRow) {
    const dialog = this.matDialog.open(DeleteWarningComponent, {
      closeOnNavigation: false,
      disableClose: false,
      panelClass: 'warning-dialog',
      data: {
        title: 'group',
        message: `Group ${row.name} will be deleted`,
      }
    });
    dialog.afterClosed().subscribe(res => {
      if (res) {
        while (row.grouppedFields.length) {
          this.removeFromGroup(row, row.grouppedFields[ 0 ]);
        }
        this.bridgeService.arrowsCache = Object.fromEntries(Object.entries(this.bridgeService.arrowsCache)
          .filter(([ k, v ]) => !(v.source.tableName === row.tableName && v.source.name === row.name)));
      }
    });
  }

  removeRowsFromSimilarTable(fieldsToGroup: string[]) {
    const similarTableIndex = this.tables.findIndex(item => item.name === 'similar');
    if (similarTableIndex !== -1) {
      fieldsToGroup.forEach(item => {
        const srows = this.bridgeService.findSimilarRows(
          this.tables.filter(tbl => tbl.name !== 'similar' && tbl.name !== this.table.name),
          item
        );

        if (srows.length <= 1) {
          this.tables[ similarTableIndex ].rows = this.tables[ similarTableIndex ].rows.filter(r => r.name !== item);
          this.bridgeService.arrowsCache = Object.fromEntries(
            Object.entries(this.bridgeService.arrowsCache)
              .filter(([ k, v ]) => !(v.source.tableName === 'similar' && v.source.name === item))
          );
        }
      });
    }
  }

  addRowsToSimilarTable(rowToAdd: IRow) {
    const similarTable = this.tables.find(item => item.name === 'similar');
    if (similarTable) {
      const srows = this.bridgeService.findSimilarRows(
        this.tables.filter(tbl => tbl.name !== 'similar'),
        rowToAdd.name
      );
      if (srows.length > 1) {
        rowToAdd.tableName = 'similar';
        rowToAdd.tableId = similarTable.id;
        similarTable.rows.push(rowToAdd);
      }
    }
  }

  removeFromGroup(detail: IRow, row: IRow) {
    const removedRow = detail.grouppedFields.find(item => item.name === row.name);
    const removedRowIdx = detail.grouppedFields.findIndex(item => item.name === row.name);
    const rowIndex = this.table.rows.findIndex(item => item.name === detail.name);
    this.table.rows[ rowIndex ].grouppedFields.splice(removedRowIdx, 1);
    if (this.table.rows[ rowIndex ].grouppedFields.length === 0) {
      this.table.rows.splice(rowIndex, 1);
    }
    const insertIndex = this.table.rows.findIndex(item => item.grouppedFields.length === 0);
    this.table.rows.splice(insertIndex, 0, removedRow);
    this.addRowsToSimilarTable(cloneDeep(removedRow));
    this.updateRowsIndexesAnsSaveChanges();

  }

  updateRowsIndexesAnsSaveChanges() {
    if (this.area === 'source') {
      if (this.table.name === 'similar') {
        this.storeService.state.sourceSimilar = this.table.rows;
      } else {
        this.storeService.state.source.find(item => item.name === this.table.name).rows = this.table.rows;
      }
    } else {
      if (this.table.name === 'similar') {
        this.storeService.state.targetSimilar = this.table.rows;
      } else {
        const targetClones = this.storeService.state.targetClones[ this.table.name ];
        if (targetClones) {
          const storedTarget = this.storeService.state.target.find(item => item.name === this.table.name && item.cloneName === this.table.cloneName);
          storedTarget ? storedTarget.rows = this.table.rows :
            targetClones.find(item => item.cloneName === this.table.cloneName).rows = this.table.rows;
        } else {
          this.storeService.state.target.find(item => item.name === this.table.name).rows = this.table.rows;
        }
      }
    }
    this.refreshPanel();
  }

  isRowHasConnection(row: IRow): boolean {
    return this.bridgeService.rowHasAnyConnection(row, this.area, this.oppositeTableId);
  }

  openCommentDialog(anchor: HTMLElement, row: IRow) {
    this.matDialog.open(CommentPopupComponent, {
      closeOnNavigation: true,
      disableClose: true,
      data: row,
      panelClass: 'perseus-dialog'
    })
  }

  openConstantDialog(anchor: HTMLElement, row: IRow) {
    if (!this.isRowHasConnection(row)) {
      if (this.conceptFieldNames[ row.tableName ] &&
        this.conceptFieldNames[ row.tableName ].includes(row.name)) {
        this.openConceptDialog(row);
      } else {
        this.openNonConceptConstantDialog(anchor, row);
      }
    }
  }

  openConceptDialog(row: IRow) {
    this.matDialog.open(ConceptTransformationComponent, {
      closeOnNavigation: false,
      disableClose: true,
      panelClass: 'perseus-dialog',
      maxHeight: '100%',
      data: {
        arrowCache: this.bridgeService.arrowsCache,
        row,
        oppositeSourceTable: this.oppositeTableName ? this.oppositeTableName : 'similar'
      }
    });
  }

  openNonConceptConstantDialog(anchor: HTMLElement, targetRow: IRow) {
    const value = targetRow.constant;
    const mode = value ? 'view' : 'add';
    const type = targetRow.type;
    const data = { value, mode, type };
    const component = AddConstantPopupComponent;

    const dialogOptions: OverlayConfigOptions = {
      hasBackdrop: true,
      backdropClass: 'custom-backdrop',
      positionStrategyFor: `comments-${this._getArea()}`,
      payload: data
    };

    const overlayRef = this.overlayService.open(
      dialogOptions,
      anchor,
      component
    );

    overlayRef.afterClosed$.subscribe(() => {
      if (data['event']) {
        targetRow.constant = data.value;
        this.updateIncrementOrConstantFields(targetRow, 'constant');
      }
    });
  }

  selectIncrement(anchor: HTMLElement, row: IRow) {
    if (!this.isRowHasConnection(row)) {
      row.increment = !row.increment;
      this.updateIncrementOrConstantFields(row, 'increment');
    }
  }

  updateIncrementOrConstantFields(row: IRow, type: string) {
    let similarRows = [];
    if (row.tableName.toUpperCase() === 'SIMILAR') {
      similarRows = this.bridgeService.findSimilarRows(this.tables, row.name);
    } else {
      similarRows.push(row);
    }
    const isSameRow = (item: IRow) => {
      let found = false;
      similarRows.forEach(similarItem => {
        if (item.tableName.toUpperCase() === similarItem.tableName.toUpperCase() &&
          item.name.toUpperCase() === similarItem.name.toUpperCase() && item.cloneTableName === similarItem.cloneTableName) {
          found = true;
        }
      });
      return found;
    };

    if (type === 'increment') {
      const value = row.increment;

      if (this.storeService.state.targetClones[row.tableName]) {
        this.bridgeService.updateRowsProperties(this.storeService.state.targetClones[row.tableName], isSameRow,
          (item: any) => item.increment = value
        )
      } else {
        this.bridgeService.updateRowsProperties(this.storeService.state.target, isSameRow,
          (item: any) => item.increment = value
        );
      }
    } else { // type === 'constant'
      const value = row.constant;
      const tables = this.storeService.state.targetClones[row.tableName] ?
        this.storeService.state.targetClones[row.tableName] :
        this.tables;

      this.bridgeService.updateRowsProperties(tables, isSameRow, (targetRow: IRow) => {
        targetRow.constant = value;

        const sourceTableId = this.selectedSourceTableId
        const updateConst = (rowToUpdate: IRow) => {
          if (rowToUpdate.constant) {
            this.bridgeService.addConstant.execute({sourceTableId, targetRow: rowToUpdate});
          } else {
            this.bridgeService.dropConstant.execute({sourceTableId, targetRow: rowToUpdate});
          }
        }

        if (this.selectedTargetTableId === this.targetSimilarTableId) {
          const rowToUpdate = toNoConceptRows(this.bridgeService.findSimilarRows(tables, targetRow.name))
          rowToUpdate.forEach(r => {
            r.constant = targetRow.constant
            updateConst(r)
          })
        } else {
          updateConst(targetRow)
        }
      });
    }
  }

  getRowId(name: string) {
    return `${this.area}-${name}`;
  }

  hasComment(row: IRow) {
    return row.comments.length;
  }

  rowClick($event: MouseEvent) {
    $event.stopPropagation();
    // Windows and Linux - ctrl, Mac - command
    const ctrlOrCommandKeyClicked = $event.ctrlKey || $event.metaKey
    this.setRowFocus($event.currentTarget, ctrlOrCommandKeyClicked);
  }

  setRowFocus(target, ctrlKey) {
    if (target) {
      const targetFocused = this.rowFocusedElements.find(item => item.id === target.id);
      if (!ctrlKey) {
        if (!targetFocused) {
          this.unsetRowFocus();
        }
      } else {
        if (targetFocused) {
          targetFocused.classList.remove('row-focus');
          this.rowFocusedElements = this.rowFocusedElements.filter(item => item.id !== target.id);
        }
      }
      if (!targetFocused) {
        this.rowFocusedElements.push(target);
        this.rowFocusedElements[this.rowFocusedElements.length - 1].classList.add('row-focus');
      }
    }
  }

  unsetRowFocus() {
    const focused: HTMLAllCollection = this.elementRef.nativeElement.querySelectorAll('.row-focus');
    Array.from(focused).forEach((it: HTMLElement) => it.classList.remove('row-focus'));
    this.rowFocusedElements = [];
  }

  // connector type is not reflected in the table
  reflectConnectorsPin(table: ITable) {
    this.connectortype = {};
    Object.values(this.bridgeService.arrowsCache)
      .filter(connection => {
        return this.equals(connection[ table.area ].tableName, table.name);
      })
      .forEach(connection => {
        this.showConnectorPinElement(connection, table.area);
      });
  }

  showConnectorPinElement(connection: IConnection, area: Area) {
    const rowId = connection[ area ].name;
    const element = document.getElementById(rowId);
    if (element) {
      const collection = element.getElementsByClassName('connector-pin');
      for (let i = 0; i < collection.length; i++) {
        this.renderer.removeClass(collection[ i ], 'hide');
      }
    }
  }

  hideAllConnectorPin(element) {
    const collection = element.getElementsByClassName('connector-pin');
    for (let i = 0; i < collection.length; i++) {
      this.renderer.addClass(collection[ i ], 'hide');
    }
  }

  hideConnectorPin(connection: IConnection, area: Area) {
    const rowId = connection[ area ].name;
    const element = document.getElementById(rowId);
    if (element) {
      const collection = element.getElementsByClassName('connector-pin');
      for (let i = 0; i < collection.length; i++) {
        this.renderer.addClass(collection[ 0 ], 'hide');
      }
    }
  }

  isHidden(row) {
    if (this.filtered === undefined) {
      return false;
    }
    return !this.filtered.includes(row.name);
  }

  isFiltered(row) {
    if (this.filteredFields === undefined) {
      return false;
    }
    return (this.filteredFields &&
      this.filteredFields.items &&
      this.filteredFields.items.length &&
      (!this.filteredFields.items.includes(row.name.toUpperCase()) &&
        !this.filteredFields.items.includes(row.name)));
  }

  showConstant(column: IRow) {
    return this.area === 'target' && !column.uniqueIdentifier
  }

  private _getArea() {
    return this.table.area;
  }
}
