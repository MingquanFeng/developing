"use client";

/**
 * PhotoRow —— (DEPRECATED) 单张照片的一行编辑
 * ------------------------------------------------------------------
 * 历史组件：被 AdminPhotoGrid（瀑布网格 + EditLightbox）取代。
 * 保留文件仅为让旧 import 不立即红，下个版本移除。
 * 替换为：import AdminPhotoGrid from "@/components/admin/AdminPhotoGrid"
 * ------------------------------------------------------------------
 * - 缩略图：异步走 fetchPhotoUrl（带 15min 缓存），不显示公开直链
 * - 行内编辑：标题 / 地点 / 所在相册 / 公开/私有
 * - isPublic 切换：上层调用 onEdit({isPublic})；我们用 PATCH 单张高频接口
 * - 回收站模式下：除缩略图、标题、地点、相册、可改字段全部 disabled，并
 *   显示"恢复 / 彻底删除"
 *
 * 不持有任何业务状态——所有变更通过 onEdit 回弹。
 */
import { useEffect, useState } from "react";
import { fetchPhotoUrl } from "@/lib/album-client";
import type { Album, Photo } from "@/lib/contracts";
import styles from "./admin.module.css";

export type PhotoRowProps = {
  photo: Photo;
  albums: Album[];
  checked: boolean;
  onToggle: () => void;
  onEdit: (patch: Partial<Photo>) => void;
  onRestore: () => void;
  onPurge: () => void;
  inTrash: boolean;
};

export default function PhotoRow({
  photo,
  albums,
  checked,
  onToggle,
  onEdit,
  onRestore,
  onPurge,
  inTrash,
}: PhotoRowProps) {
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchPhotoUrl(photo.id, "thumb").then((u) => {
      if (alive) setThumb(u);
    });
    return () => {
      alive = false;
    };
  }, [photo.id]);

  return (
    <li className={styles.row}>
      {!inTrash ? (
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          aria-label={`选择 ${photo.title}`}
        />
      ) : null}

      <img
        className={styles.thumb}
        src={thumb ?? undefined}
        alt={photo.title}
        loading="lazy"
      />

      <div className={styles.fields}>
        <input
          className={styles.input}
          value={photo.title}
          onChange={(e) => onEdit({ title: e.target.value })}
          placeholder="标题"
          disabled={inTrash}
        />
        <input
          className={styles.input}
          value={photo.place}
          onChange={(e) => onEdit({ place: e.target.value })}
          placeholder="地点"
          disabled={inTrash}
        />
        <select
          className={styles.input}
          value={photo.albumId}
          onChange={(e) => onEdit({ albumId: e.target.value })}
          disabled={inTrash}
        >
          {albums.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      {/* 可见性：私有照片只有本人能看到，读取走签名 URL */}
      <label className={styles.visibility} title="私有照片仅自己可见">
        <input
          type="checkbox"
          checked={photo.isPublic}
          onChange={(e) => onEdit({ isPublic: e.target.checked })}
          disabled={inTrash}
        />
        <span>{photo.isPublic ? "公开" : "私有"}</span>
      </label>

      <span className={styles.dim}>
        {photo.width}×{photo.height}
      </span>

      {inTrash ? (
        <span className={styles.actions}>
          <button className={`${styles.btn} ${styles.btnGhost}`} onClick={onRestore}>
            恢复
          </button>
          <button className={`${styles.btn} ${styles.btnDanger}`} onClick={onPurge}>
            彻底删除
          </button>
        </span>
      ) : null}
    </li>
  );
}
