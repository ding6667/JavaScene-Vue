/** 上传文件类型（对应后端 fileType 查询参数） */
export type UploadFileType = 'WORD' | 'ZIP';

export interface UploadFileRecord {
  id: string;
  fileName: string;
  fileSize: number;
  uploadTime: string;
  expireTime: string;
  /** 班级 id */
  classId?: number;
}

export interface UploadFileQuery {
  pageNum: number;
  pageSize: number;
  fileName?: string;
  isAsc?: boolean;
  /** 文件类型筛选：WORD / ZIP */
  fileType?: UploadFileType;
}
