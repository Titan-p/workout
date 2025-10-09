import { useRef, useState } from "react";
import { api } from "../lib/api";

interface Props {
  onSuccess?: (message: string) => void;
}

export function UploadForm({ onSuccess }: Props) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [status, setStatus] = useState<{ state: "idle" | "uploading" | "success" | "error"; message?: string }>({ state: "idle" });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const file = formData.get("file");

    if (!(file instanceof File) || !file.name) {
      setStatus({ state: "error", message: "请选择要上传的 Excel 文件" });
      return;
    }

    setStatus({ state: "uploading" });
    try {
      const result = await api.uploadPlan(formData);
      setStatus({ state: "success", message: result.message });
      onSuccess?.(result.message);
      event.currentTarget.reset();
    } catch (error) {
      setStatus({ state: "error", message: (error as Error).message });
    }
  }

  return (
    <form ref={formRef} className="upload-form" onSubmit={handleSubmit}>
      <label className="upload-drop" htmlFor="file">
        <span className="upload-title">导入训练计划</span>
        <span className="upload-subtitle">支持 .xlsx 文件，最大 10MB</span>
        <input id="file" name="file" type="file" accept=".xlsx" />
      </label>
      <button type="submit" disabled={status.state === "uploading"}>
        {status.state === "uploading" ? "上传中…" : "上传文件"}
      </button>
      {status.state !== "idle" && status.message && (
        <p className={`upload-message ${status.state}`}>{status.message}</p>
      )}
    </form>
  );
}
