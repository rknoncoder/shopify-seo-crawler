export interface StructuredDataItem {
  type: string;
  raw: unknown;
  validJson: boolean;
  errors: string[];
}

export interface SchemaExpectation {
  pageType: string;
  expectedTypes: string[];
}
