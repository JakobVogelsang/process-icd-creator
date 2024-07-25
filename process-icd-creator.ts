import { css, html, LitElement, TemplateResult } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';

import '@material/mwc-dialog';
import type { Dialog } from '@material/mwc-dialog';

import { Insert, newEditEvent } from '@openscd/open-scd-core';

import './sld-viewer.js';

import '@openenergytools/filterable-lists/dist/action-list.js';
import type { ActionItem } from '@openenergytools/filterable-lists/dist/action-list.js';
import { getReference, importLNodeType } from '@openenergytools/scl-lib';
import { compareLNodeType, getDatType } from './foundation/diffing.js';

// const uri6100 = 'http://www.iec.ch/61850/2019/SCL/6-100';
// const prefix6100 = 'eTr_6-100';

function lNodeTitle(lNode: Element): string {
  return `${lNode.getAttribute('prefix') ?? ''}${lNode.getAttribute(
    'lnClass'
  )}${lNode.getAttribute('lnInst')}`;
}

function anyLnTitle(lNode: Element): string {
  return `${lNode.getAttribute('prefix') ?? ''}${lNode.getAttribute(
    'lnClass'
  )}${lNode.getAttribute('inst')}`;
}

function lNodePath(lNode: Element): string {
  function isLNode(element: Element): boolean {
    return element.tagName === 'LNode';
  }

  if (!lNode.parentElement || lNode.parentElement.tagName === 'SCL')
    return `${lNode.getAttribute('name')}`;

  if (isLNode(lNode)) {
    if (!lNode.parentElement) return ``;
    return lNodePath(lNode.parentElement);
  }

  return `${lNodePath(lNode.parentElement)}/${lNode.getAttribute('name')}`;
}

function anyLnPath(anyLn: Element): string {
  function isAnyLn(element: Element): boolean {
    return element.tagName === 'LN0' || element.tagName === 'LN';
  }

  if (!anyLn.parentElement || anyLn.parentElement.tagName === 'SCL')
    return `${anyLn.getAttribute('name')}`;

  if (isAnyLn(anyLn)) {
    if (!anyLn.parentElement) return ``;
    return anyLnPath(anyLn.parentElement);
  }

  if (anyLn.tagName === 'LDevice')
    return `${anyLnPath(anyLn.parentElement)} ${anyLn.getAttribute('inst')}`;

  if (anyLn.tagName === 'IED')
    return `${anyLnPath(anyLn.parentElement)} ${anyLn.getAttribute('name')}`;

  return `${anyLnPath(anyLn.parentElement)}`;
}

/*
function lNodePath(lNode: Element, path: string[]): string {
  if (!lNode.parentElement || lNode.parentElement.tagName === 'SCL') {
    const name = lNode.getAttribute('name') ?? '';
    path.splice(0, 0, name);
    return path.join('/');
  }

  const name = lNode.getAttribute('name') ?? '';

  path.splice(0, 0, name);
  return lNodePath(lNode.parentElement, path);
}

function linkedEquipment(doc: XMLDocument, selectedFunc?: Element): Element[] {
  if (!selectedFunc) return [];

  return Array.from(
    doc.querySelectorAll(
      ':root > Substation > VoltageLevel > Bay > ConductingEquipment'
    )
  ).filter(condEq => {
    const lNodePaths = Array.from(condEq.querySelectorAll('LNode')).map(lNode =>
      lNodePath(lNode, [])
    );

    return lNodePaths.some(path =>
      Array.from(
        selectedFunc.querySelectorAll(':scope LNode > Private SourceRef')
      ).some(srcRef => srcRef.getAttribute('source')?.startsWith(path))
    );
  });
} */

function fits(anyLn: Element, lNode: Element): boolean {
  if (!lNode) return false;
  // when the lnClass is the same
  if (anyLn.getAttribute('lnClass') === lNode.getAttribute('lnClass'))
    return true;

  return false;
}

function anLnFromLNode(lNode: Element): Element | null {
  const [iedName, ldInst, prefix, lnClass, lnInst] = [
    'iedName',
    'ldInst',
    'prefix',
    'lnClass',
    'lnInst',
  ].map(attr => lNode.getAttribute(attr));

  return (
    Array.from(
      lNode.ownerDocument.querySelectorAll(
        `:root > IED[name="${iedName}"] LDevice[inst="${ldInst}"] > LN0[lnClass="${lnClass}"], :root > IED[name="${iedName}"] LDevice[inst="${ldInst}"] > LN[lnClass="${lnClass}"]`
      )
    ).find(
      anyLn =>
        (anyLn.getAttribute('prefix') ?? '') === (prefix ?? '') &&
        (anyLn.getAttribute('inst') ?? '') === (lnInst ?? '')
    ) ?? null
  );
}

function gestSpecifiedLNodeType(lNode: Element | null): Element | null {
  return (
    lNode?.ownerDocument.querySelector(
      `:root > DataTypeTemplates > LNodeType[id="${lNode.getAttribute(
        'lnType'
      )}"]`
    ) ?? null
  );
}

function getInstLNodeType(lNode: Element): Element | null {
  const [iedName, ldInst, prefix, lnClass, lnInst] = [
    'iedName',
    'ldInst',
    'prefix',
    'lnClass',
    'lnInst',
  ].map(attr => lNode.getAttribute(attr));

  return (
    Array.from(
      lNode.ownerDocument.querySelectorAll(
        `:root > IED[name="${iedName}"] LDevice[inst="${ldInst}"] > LN0[lnClass="${lnClass}"],:root > IED[name="${iedName}"] LDevice[inst="${ldInst}"] > LN[lnClass="${lnClass}"]`
      )
    ).find(
      ln =>
        (ln.getAttribute('prefix') ?? '') === (prefix ?? '') &&
        (ln.getAttribute('inst') ?? '') === (lnInst ?? '')
    ) ?? null
  );
}

function dataObjects(
  anyLn: Element
): { anyLn: Element; dO: Element; doType: Element }[] {
  const lNodeType = anyLn.ownerDocument.querySelector(
    `:root > DataTypeTemplates > LNodeType[id="${anyLn.getAttribute(
      'lnType'
    )}"]`
  );

  return Array.from(lNodeType?.querySelectorAll(':scope > DO') ?? []).map(
    dO => {
      const doType = getDatType(dO)!;

      return { anyLn, dO, doType };
    }
  );
}

export default class ProcessIcdCreator extends LitElement {
  @property({ attribute: false }) doc?: XMLDocument;

  @property({ type: Number }) editCount = -1;

  @state()
  get ied(): Element | null {
    return this.doc?.querySelector(':root > IED') ?? null;
  }

  @state()
  get substation(): Element | null {
    return this.doc?.querySelector(':root > Substation') ?? null;
  }

  @state() parent?: Element;

  @state() lNodeForLink?: Element;

  @state() lNodeForResolve?: Element;

  @state() selectedAnyLn?: Element;

  @state() showLinkDialog = false;

  @state() showDoReLinkDialog = false;

  @state() selectedDo: any = {};

  @query('#lib-input') libInput!: HTMLInputElement;

  @query('#icd-input') icdInput!: HTMLInputElement;

  @query('#lnpicker') lnPicker!: Dialog;

  private linkLNode(anyLn: Element): void {
    const iedName = anyLn.closest('IED')?.getAttribute('name');
    const ldInst = anyLn.closest('LDevice')?.getAttribute('inst');

    const prefix = anyLn.getAttribute('prefix');
    const lnClass = anyLn.getAttribute('lnClass');
    const inst = anyLn.getAttribute('inst');

    const update = {
      element: this.lNodeForLink!,
      attributes: { iedName, ldInst, prefix, lnClass, lnInst: inst },
    };

    this.dispatchEvent(newEditEvent(update));
    this.lNodeForLink = undefined;
  }

  private async loadSubstationFromTemplate(event: Event): Promise<void> {
    const file = (<HTMLInputElement | null>event.target)?.files?.item(0);
    if (!file) return;

    const text = await file.text();
    const doc = new DOMParser().parseFromString(
      text,
      'application/xml'
    ) as XMLDocument;

    const parent = this.doc!.documentElement as Element;
    const substation = doc
      .querySelector(':root > Substation')
      ?.cloneNode(true) as Element;
    if (substation)
      this.dispatchEvent(
        newEditEvent({
          parent,
          node: substation,
          reference: getReference(parent, 'Substation'),
        })
      );

    const edits = Array.from(
      substation.querySelectorAll(':scope LNode')
    ).flatMap(lNode => {
      const lNodeType = doc.querySelector(
        `:root > DataTypeTemplates > LNodeType[id="${lNode.getAttribute(
          'lnType'
        )}"]`
      );

      return lNodeType ? importLNodeType(lNodeType, this.doc!) : [];
    });

    const uniqueIDs: string[] = [];
    const uniqueEdits: Insert[] = [];
    edits.forEach(edit => {
      const id = (edit.node as Element).getAttribute('id');
      if (id && !uniqueIDs.includes(id)) {
        uniqueIDs.push(id);
        uniqueEdits.push(edit);
      }
    });

    this.dispatchEvent(newEditEvent(uniqueEdits));
  }

  // eslint-disable-next-line class-methods-use-this
  private renderDOs(): TemplateResult {
    if (!this.lNodeForResolve) return html``;

    const specifiedLNodeType = gestSpecifiedLNodeType(this.lNodeForResolve);
    const instLNodeType = gestSpecifiedLNodeType(
      getInstLNodeType(this.lNodeForResolve)
    );

    if (!specifiedLNodeType || !instLNodeType) return html``;

    const diff = compareLNodeType(specifiedLNodeType, instLNodeType);

    function endingIcon(dO: any): string {
      if (dO.different === false) return 'check';
      if (dO.different && dO.diffType === 'missing') return 'unknown_med';

      return 'warning';
    }

    const items = diff.dos.map(dO => {
      const item: ActionItem = {
        headline: dO.name,
        supportingText: dO.type?.getAttribute('cdc')!,
        actions: [
          {
            icon: endingIcon(dO),
            callback: () => {
              window.alert(JSON.stringify(dO, null, 2));
            },
          },
          /* 
          {
            icon: 'change_circle',
            callback: () => {
              this.showDoReLinkDialog = true;
              this.selectedDo = dO;
            },
          }, */
        ],
      };

      return item;
    });

    return html`<action-list
      filterable
      searchhelper="Filter LNode's"
      .items=${[...items]}
    ></action-list>`;
  }

  private renderCdcMappingDialog(): TemplateResult {
    const items = Array.from(
      this.doc?.querySelectorAll(':scope LN0,:scope LN') ?? []
    )
      .flatMap(dataObjects)
      .filter(dO => this.selectedDo.class === dO.doType.getAttribute('cdc'))
      .map(dO => {
        const item: ActionItem = {
          headline: `${dO.dO.getAttribute('name')} (${dO.doType.getAttribute(
            'cdc'
          )!})`,
          supportingText: `${anyLnPath(dO.anyLn)} ${anyLnTitle(dO.anyLn)}`,
          primaryAction: () => {},
        };

        return item;
      });

    const title = this.lNodeForLink
      ? `${lNodeTitle(this.lNodeForLink)}`
      : 'No LNode selected';

    const subTitle = this.lNodeForLink ? `${lNodePath(this.lNodeForLink)}` : '';

    return html`<mwc-dialog
      id="doPicker"
      ?open=${this.showDoReLinkDialog}
      @closed="${() => {
        this.showDoReLinkDialog = false;
      }}"
    >
      <h3>${title}</h3>
      <h4>${subTitle}</h4>

      <action-list
        filterable
        searchhelper="Filter CDCs"
        .items=${items}
      ></action-list>
    </mwc-dialog>`;
  }

  private renderLnMappingDialog(): TemplateResult {
    const items = Array.from(
      this.ied?.querySelectorAll(':scope LN0,:scope LN') ?? []
    )
      .filter(anyLn => fits(anyLn, this.lNodeForLink!))
      .map(anyLn => {
        const item: ActionItem = {
          headline: anyLnTitle(anyLn),
          supportingText: anyLnPath(anyLn),
          primaryAction: () => {
            this.linkLNode(anyLn);
            this.showLinkDialog = false;
          },
        };

        return item;
      });

    const title = this.lNodeForLink
      ? `${lNodeTitle(this.lNodeForLink)}`
      : 'No LNode selected';

    const subTitle = this.lNodeForLink ? `${lNodePath(this.lNodeForLink)}` : '';

    return html`<mwc-dialog
      id="lnPicker"
      ?open=${this.showLinkDialog}
      @closed="${() => {
        this.showLinkDialog = false;
      }}"
    >
      <h3>${title}</h3>
      <h4>${subTitle}</h4>

      <action-list
        filterable
        searchhelper="Filter Logical Node instance"
        .items=${items}
      ></action-list>
    </mwc-dialog>`;
  }

  // eslint-disable-next-line class-methods-use-this
  private renderLNodes(): TemplateResult {
    const root = this.parent ? this.parent : this.doc;

    const selector = this.parent
      ? `:scope > Function LNode, :scope > LNode, :scope > EqFunction LNode, :scope > SubEquipment LNode`
      : `:root > Substation LNode`;

    function supportingText(lNode: Element): string {
      const linkedLn = anLnFromLNode(lNode);
      if (linkedLn) return `${lNodePath(lNode)} -> ${anyLnPath(linkedLn)}`;
      return `${lNodePath(lNode)}`;
    }

    const linkedItems = Array.from(root?.querySelectorAll(selector) ?? [])
      .filter(lNode => lNode.getAttribute('iedName') !== 'None')
      .map(lNode => {
        const specifiedLNodeType = gestSpecifiedLNodeType(lNode);
        const instLNodeType = gestSpecifiedLNodeType(getInstLNodeType(lNode));

        const diff =
          specifiedLNodeType && instLNodeType
            ? compareLNodeType(specifiedLNodeType, instLNodeType)
            : undefined;

        const item: ActionItem = {
          headline: lNodeTitle(lNode),
          supportingText: supportingText(lNode),
          startingIcon: 'link',
          actions: [
            {
              icon: diff?.different === false ? 'check' : 'warning',
              callback: () => {
                window.alert(JSON.stringify(diff, null, 2));
              },
            },
            /*
            {
              icon: 'subdirectory_arrow_left',
              label: 'differences',
              callback: () => {
                this.lNodeForResolve = lNode;
              },
            }, */
          ],
        };

        return item;
      });

    const unlinkedItems = Array.from(root?.querySelectorAll(selector) ?? [])
      .filter(lNode => lNode.getAttribute('iedName') === 'None')
      .map(lNode => {
        const item: ActionItem = {
          headline: lNodeTitle(lNode),
          supportingText: supportingText(lNode),
          startingIcon: 'link_off',
          actions: [
            {
              icon: 'link',
              callback: () => {
                this.lNodeForLink = lNode;
                this.showLinkDialog = true;
              },
            },
          ],
        };

        return item;
      });

    return html`<action-list
      filterable
      searchhelper="Filter LNode's"
      .items=${[...unlinkedItems, ...linkedItems]}
    ></action-list>`;
  }

  // eslint-disable-next-line class-methods-use-this
  private renderICDInputs(): TemplateResult {
    return html`<div class="container settings">
      The ICD file has no process elements, yet!
      <button
        @click="${() => this.icdInput.click()}"
        style="height:30px;margin:10px"
      >
        Load from bay template
      </button>
      <input
        id="icd-input"
        style="display:none;"
        @click=${({ target }: MouseEvent) => {
          // eslint-disable-next-line no-param-reassign
          (<HTMLInputElement>target).value = '';
        }}
        @change=${this.loadSubstationFromTemplate}
        type="file"
      />
    </div>`;
  }

  render() {
    return html`<main>
      <sld-viewer
        .substation=${this.substation!}
        .gridSize=${32}
        .parent=${this.parent}
        .linked=${[]}
        @select-equipment="${(evt: CustomEvent) => {
          this.parent = evt.detail.element;
          this.lNodeForResolve = undefined;
        }}"
      ></sld-viewer>
      <div
        class="${classMap({ lnode: true, selected: !!this.lNodeForResolve })}"
      >
        ${this.substation
          ? html`${this.renderLNodes()}`
          : html`${this.renderICDInputs()}`}
      </div>
      <div
        class="${classMap({ anyln: true, selected: !!this.lNodeForResolve })}"
      >
        ${this.ied
          ? html`${this.renderDOs()}`
          : html`${this.renderICDInputs()}`}
      </div>
      ${this.renderLnMappingDialog()} ${this.renderCdcMappingDialog()}
    </main>`;
  }

  static styles = css`
    * {
      --md-sys-color-primary: var(--oscd-primary);
      --md-sys-color-secondary: var(--oscd-secondary);
      --md-sys-typescale-body-large-font: var(--oscd-theme-text-font);
      --md-outlined-text-field-input-text-color: var(--oscd-base01);

      --md-sys-color-surface: var(--oscd-base3);
      --md-sys-color-on-surface: var(--oscd-base00);
      --md-sys-color-on-primary: var(--oscd-base2);
      --md-sys-color-on-surface-variant: var(--oscd-base00);
      --md-menu-container-color: var(--oscd-base3);
      font-family: var(--oscd-theme-text-font);
      --md-sys-color-surface-container-highest: var(--oscd-base2);
    }

    main {
      width: 100%;
      height: 100%;
      display: flex;
    }

    .lnode {
      height: 91vh;
      width: 100%;
      overflow: scroll;
      margin: 10px;
    }

    .lnode.selected {
      width: calc(100% - 400px);
    }

    .anyln {
      display: none;
      width: 400px;
      background-color: var(--oscd-base3);
      border-radius: 10px;
      margin: 10px;
      z-index: 99;
      box-shadow: rgba(0, 0, 0, 0.14) 0px 8px 10px 1px,
        rgba(0, 0, 0, 0.12) 0px 3px 14px 2px,
        rgba(0, 0, 0, 0.2) 0px 5px 5px -3px;
    }

    .anyln.selected {
      display: inherit;
    }
  `;
}
