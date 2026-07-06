export interface UploadFileRecord {
  id: string;
  fileName: string;
  fileSize: number;
  uploadTime: string;
  expireTime: string;
}

export interface UploadFileQuery {
  pageNum: number;
  pageSize: number;
  fileName?: string;
  isAsc?: boolean;
}
