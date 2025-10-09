import { useState } from "react";
import { UploadForm } from "../components/UploadForm";

export function UploadPlan() {
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="page">
      <section className="card">
        <header className="card-header">
          <p className="card-title">更新训练计划</p>
          <p className="card-subtitle">上传 Excel 表格后，系统会自动同步到手机端</p>
        </header>
        <UploadForm onSuccess={setMessage} />
        {message && <p className="upload-message success">{message}</p>}
      </section>
    </div>
  );
}
