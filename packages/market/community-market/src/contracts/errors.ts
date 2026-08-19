import type { ErrorObject } from 'ajv'

/** The set of catalog documents a community-market provider contract can validate. */
export type CatalogContractName = 'source' | 'query' | 'provider-page' | 'snapshot' | 'local-source' | 'identity'

/** A single reported violation of a catalog contract, carrying a JSON path, a human message, and the failing keyword. */
export interface CatalogContractIssue {
  readonly path: string
  readonly message: string
  readonly keyword: string
}

/** An error thrown when a catalog document fails its contract, listing every violating issue. */
export class CatalogContractError extends Error {
  /** The catalog document whose contract was rejected. */
  readonly contract: CatalogContractName
  /** The issues that caused the contract rejection. */
  readonly issues: readonly CatalogContractIssue[]

  constructor(contract: CatalogContractName, issues: readonly CatalogContractIssue[]) {
    super(`${contract} contract rejected: ${issues.map(issue => `${issue.path} ${issue.message}`).join('; ')}`)
    this.name = 'CatalogContractError'
    this.contract = contract
    this.issues = issues
  }
}

/** Map an Ajv error list to catalog contract issues, synthesizing a generic issue when none is provided.
 * @param errors - the Ajv validation errors, or null/undefined when validation failed without errors.
 * @returns one CatalogContractIssue per Ajv error, or a single generic issue at the document root.
 */
export function schemaIssues(errors: readonly ErrorObject[] | null | undefined): readonly CatalogContractIssue[] {
  if (!errors?.length) {
    return [{ path: '/', message: 'is invalid', keyword: 'validation' }]
  }

  return errors.map(error => ({
    path: error.instancePath || '/',
    message: error.message ?? 'is invalid',
    keyword: error.keyword,
  }))
}

/** Build a catalog contract issue arising from semantic rules beyond schema validation.
 * @param path - the JSON path the issue applies to.
 * @param message - the human-readable description of the semantic violation.
 * @returns a CatalogContractIssue tagged with the semantic keyword.
 */
export function semanticIssue(path: string, message: string): CatalogContractIssue {
  return { path, message, keyword: 'semantic' }
}
