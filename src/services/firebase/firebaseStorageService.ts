import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from 'firebase/storage';
import { validateAndResolveFirebaseConfig } from '../../lib/firebase/config';
import { getFirebaseStorage } from '../../lib/firebase/storage';
import type { IStorageService } from '../contracts/storageService';

const ALLOWED_LOGO_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

export interface UploadedLogoAsset {
  storagePath: string;
  downloadUrl: string;
  fileName: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  sizeBytes: number;
}

export class FirebaseStorageService implements IStorageService {
  isConnected(): boolean {
    const validation = validateAndResolveFirebaseConfig();
    return validation.mode === 'FIREBASE_CONNECTED' && Boolean(getFirebaseStorage());
  }

  async uploadCentreLogo(
    file: File,
    adminUid: string
  ): Promise<{ storagePath: string; downloadUrl: string }> {
    const asset = await this.uploadValidatedCentreLogo(file, adminUid);
    return {
      storagePath: asset.storagePath,
      downloadUrl: asset.downloadUrl,
    };
  }

  async uploadValidatedCentreLogo(
    file: File,
    adminUid: string
  ): Promise<UploadedLogoAsset> {
    if (!adminUid) {
      throw new Error('Admin authentication is required to upload centre logo.');
    }
    if (!ALLOWED_LOGO_MIME_TYPES.has(file.type)) {
      throw new Error('Unsupported file format. Upload a PNG, JPEG, or WebP logo image.');
    }
    if (file.size <= 0 || file.size > MAX_LOGO_SIZE_BYTES) {
      throw new Error('Logo image must be greater than 0 bytes and at most 2 MB.');
    }

    const storage = getFirebaseStorage();
    if (!storage) {
      throw new Error(
        'Firebase Storage is not initialized or bucket is unavailable. Check Firebase Console -> Storage.'
      );
    }

    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 64) || 'logo';
    const storagePath = `branding/centre-logo/${Date.now()}-${sanitizedName}`;
    const storageRef = ref(storage, storagePath);

    await uploadBytes(storageRef, file, {
      contentType: file.type,
      customMetadata: {
        uploadedBy: adminUid,
      },
    });

    const downloadUrl = await getDownloadURL(storageRef);
    return {
      storagePath,
      downloadUrl,
      fileName: file.name,
      mimeType: file.type as UploadedLogoAsset['mimeType'],
      sizeBytes: file.size,
    };
  }

  async deleteLogoAsset(storagePath: string): Promise<void> {
    if (!storagePath || !storagePath.startsWith('branding/centre-logo/')) {
      return;
    }
    const storage = getFirebaseStorage();
    if (!storage) return;
    const storageRef = ref(storage, storagePath);
    await deleteObject(storageRef).catch(() => undefined);
  }
}

export const firebaseStorageService = new FirebaseStorageService();
