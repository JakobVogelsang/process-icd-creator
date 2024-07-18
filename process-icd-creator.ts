import { css, html, LitElement, TemplateResult } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';

import { Insert, newEditEvent } from '@openscd/open-scd-core';

import './sld-viewer.js';

import '@openenergytools/filterable-lists/dist/action-list.js';
import type { ActionItem } from '@openenergytools/filterable-lists/dist/action-list.js';
import { getReference, importLNodeType } from '@openenergytools/scl-lib';

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

  @query('#lib-input') libInput!: HTMLInputElement;

  @query('#icd-input') icdInput!: HTMLInputElement;

  @state() selectedTypeLNode?: Element;

  @state() selectedAnyLn?: Element;

  linkLNode(anyLn: Element): void {
    const iedName = anyLn.closest('IED')?.getAttribute('name');
    const ldInst = anyLn.closest('LDevice')?.getAttribute('inst');

    const prefix = anyLn.getAttribute('prefix');
    const lnClass = anyLn.getAttribute('lnClass');
    const inst = anyLn.getAttribute('inst');

    const update = {
      element: this.selectedTypeLNode!,
      attributes: { iedName, ldInst, prefix, lnClass, lnInst: inst },
    };

    this.dispatchEvent(newEditEvent(update));
    this.selectedTypeLNode = undefined;
  }

  // eslint-disable-next-line class-methods-use-this
  private renderICDSelection(): TemplateResult {
    const items = Array.from(
      this.ied?.querySelectorAll(':scope LN0,:scope LN') ?? []
    )
      .filter(anyLn => fits(anyLn, this.selectedTypeLNode!))
      .map(anyLn => {
        const item: ActionItem = {
          headline: anyLnTitle(anyLn),
          supportingText: anyLnPath(anyLn),
          divider: true,
          primaryAction: () => {
            this.linkLNode(anyLn);
          },
        };

        return item;
      });

    const title = this.selectedTypeLNode
      ? `${lNodeTitle(this.selectedTypeLNode)}`
      : 'No LNode selected';

    const subTitle = this.selectedTypeLNode
      ? `${lNodePath(this.selectedTypeLNode)}`
      : '';

    return html`<h3>${title}</h3>
      <h4>${subTitle}</h4>

      <action-list
        filterable
        searchhelper="Filter Logical Node instance"
        .items=${items}
      ></action-list>`;
  }

  // eslint-disable-next-line class-methods-use-this
  private renderLinks(): TemplateResult {
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
        const item: ActionItem = {
          headline: lNodeTitle(lNode),
          supportingText: supportingText(lNode),
          startingIcon: 'link',
        };

        return item;
      });

    const unlinkedItems = Array.from(root?.querySelectorAll(selector) ?? [])
      .filter(lNode => lNode.getAttribute('iedName') === 'None')
      .map(lNode => {
        const item: ActionItem = {
          headline: lNodeTitle(lNode),
          supportingText: supportingText(lNode),
          primaryAction: () => {
            this.selectedTypeLNode = lNode;
          },
          startingIcon: 'link_off',
        };

        return item;
      });

    return html`<action-list
      filterable
      searchhelper="Filter LNode's"
      .items=${[...unlinkedItems, ...linkedItems]}
    ></action-list>`;
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
        .substation=${this.substation}
        .gridSize=${32}
        .parent=${this.parent}
        .linked=${[]}
        @select-equipment="${(evt: CustomEvent) => {
          this.parent = evt.detail.element;
          this.selectedTypeLNode = undefined;
        }}"
      ></sld-viewer>
      <div
        class="${classMap({ lnode: true, selected: !!this.selectedTypeLNode })}"
      >
        ${this.substation
          ? html`${this.renderLinks()}`
          : html`${this.renderICDInputs()}`}
      </div>
      <div
        class="${classMap({ anyln: true, selected: !!this.selectedTypeLNode })}"
      >
        ${this.ied
          ? html`${this.renderICDSelection()}`
          : html`${this.renderICDInputs()}`}
      </div>
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
      position: fixed;
      width: 400px;
      right: -420px;
      top: 112px;
      border: 2px solid black;
      background-color: var(--oscd-base3);
      border-radius: 10px;
      height: 91vh;
      margin: 10px;
      z-index: 99;
      box-shadow: rgba(0, 0, 0, 0.14) 0px 8px 10px 1px,
        rgba(0, 0, 0, 0.12) 0px 3px 14px 2px,
        rgba(0, 0, 0, 0.2) 0px 5px 5px -3px;
      overflow: scroll;
    }

    .anyln.selected {
      right: 0px;
    }
  `;
}
