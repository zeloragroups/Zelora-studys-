/**
 * Storage Service Contract (Planned Firebase Storage — Disconnected)
 *
 * Scope constraint:
 * - No study-material library or PDF/image homework uploads are permitted in this ecosystem.
 * - Storage is reserved strictly for verified institutional assets (e.g., centre logo,
 *   generated receipt documents if enabled later).
 * - Screenshot uploads alone must NEVER mark a fee payment as successful.
 */
export interface IStorageService {
  isConnected(): boolean;
  uploadCentreLogo?(file: File, adminUid: string): Promise<{ storagePath: string }>;
}
