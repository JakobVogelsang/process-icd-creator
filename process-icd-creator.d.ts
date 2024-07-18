import { LitElement, TemplateResult } from 'lit';
import './sld-viewer.js';
import '@openenergytools/filterable-lists/dist/action-list.js';
export default class ProcessIcdCreator extends LitElement {
    doc?: XMLDocument;
    editCount: number;
    get ied(): Element | null;
    get substation(): Element | null;
    parent?: Element;
    libInput: HTMLInputElement;
    icdInput: HTMLInputElement;
    selectedTypeLNode?: Element;
    selectedAnyLn?: Element;
    linkLNode(anyLn: Element): void;
    private renderICDSelection;
    private renderLinks;
    private loadSubstationFromTemplate;
    private renderICDInputs;
    render(): TemplateResult<1>;
    static styles: import("lit").CSSResult;
}
