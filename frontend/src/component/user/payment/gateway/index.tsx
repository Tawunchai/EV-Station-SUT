// src/pages/user/payment/UploadSlipOnly.tsx

import React, { useMemo, useRef, useState } from "react";
import { message, Image } from "antd";
import { FileImageOutlined } from "@ant-design/icons";
import { FaUpload, FaPaperPlane, FaTimes } from "react-icons/fa";

import { uploadSlip } from "../../../../services"; // ✅ เปลี่ยนมาใช้ uploadSlip ตามที่ขอ

const UploadSlipOnly: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  // เอาไว้โชว์ผลลัพธ์ (optional) + console.log ให้ดู
  const [result, setResult] = useState<any>(null);

  const previewUrl = useMemo(() => {
    if (!uploadedFile) return "";
    return URL.createObjectURL(uploadedFile);
  }, [uploadedFile]);

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.length) {
      const file = event.target.files[0];
      setUploadedFile(file);
      setResult(null);

      console.log("✅ Selected file:", {
        name: file.name,
        type: file.type,
        size: file.size,
      });

      message.success("เลือกไฟล์สลิปแล้ว");
    }
  };

  const handleRemoveFile = () => {
    setUploadedFile(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    message.info("ลบไฟล์แล้ว");
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer.files?.length) {
      const file = event.dataTransfer.files[0];
      setUploadedFile(file);
      setResult(null);

      console.log("✅ Dropped file:", {
        name: file.name,
        type: file.type,
        size: file.size,
      });

      message.success("ลากไฟล์เข้ามาแล้ว");
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleSubmit = async () => {
    if (!uploadedFile) {
      message.warning("กรุณาอัปโหลดสลิปก่อน");
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      console.log("🚀 Uploading slip with uploadSlip()...");
      console.log("📎 File info:", {
        name: uploadedFile.name,
        type: uploadedFile.type,
        size: uploadedFile.size,
      });

      // ✅ เรียก API: POST /api/check-slip
      const data = await uploadSlip(uploadedFile);

      // ✅ console.log ให้ดูว่ากลับมาอะไรบ้าง
      console.log("✅ uploadSlip response (raw):", data);
      console.log("✅ uploadSlip response (stringify):", JSON.stringify(data, null, 2));

      if (!data) {
        message.error("อัปโหลดไม่สำเร็จ หรือ API ไม่ได้ส่งข้อมูลกลับมา");
        setLoading(false);
        return;
      }

      setResult(data);
      message.success("อัปโหลดสำเร็จ และได้รับผลลัพธ์จาก API แล้ว");
    } catch (err: any) {
      console.error("❌ uploadSlip error:", err?.response?.data || err?.message || err);
      message.error("เกิดข้อผิดพลาดตอนอัปโหลดสลิป");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header
        className="sticky top-0 z-20 bg-gradient-to-r from-blue-600 to-sky-500 text-white rounded-b-2xl shadow-md overflow-hidden"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="w-full px-4 py-3 flex items-center gap-2 justify-start">
          <button
            onClick={() => window.history.back()}
            aria-label="Back"
            className="h-9 w-9 flex items-center justify-center rounded-xl active:bg-white/15 transition-colors"
            type="button"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-white">
              <path d="M13.5 2 4 13h6l-1.5 9L20 11h-6l1.5-9Z" fill="currentColor" />
            </svg>
            <span className="text-sm md:text-base font-semibold tracking-wide">Upload Slip (CheckSlip)</span>
          </div>
        </div>
      </header>

      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-black/60 flex flex-col items-center justify-center z-50">
          <div className="bg-white rounded-2xl px-5 py-4 shadow-lg text-center">
            <div className="text-sm font-semibold text-gray-800">กำลังอัปโหลดสลิป...</div>
            <div className="text-xs text-gray-500 mt-1">โปรดรอสักครู่</div>
          </div>
        </div>
      )}

      {/* Content */}
      <main className="mx-auto max-w-screen-sm px-4 pb-28 pt-4">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 mb-2">อัปโหลดสลิปเพื่อเรียก API /api/check-slip</h2>

          {uploadedFile ? (
            <div className="relative mb-3 flex justify-center border border-gray-200 rounded-xl p-2 bg-white">
              <Image
                src={previewUrl}
                alt="Preview slip"
                style={{
                  maxHeight: 260,
                  maxWidth: "100%",
                  objectFit: "contain",
                  borderRadius: 12,
                }}
                placeholder
              />

              <button
                onClick={handleRemoveFile}
                className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 shadow transition"
                aria-label="Remove uploaded file"
                title="Delete uploaded slip"
                type="button"
              >
                <FaTimes size={14} />
              </button>
            </div>
          ) : (
            <div
              className="mb-3 flex flex-col justify-center items-center border-2 border-dashed border-gray-300 rounded-xl py-10 text-gray-500 cursor-pointer select-none"
              onClick={handleUploadClick}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              role="button"
              tabIndex={0}
            >
              <FileImageOutlined style={{ fontSize: 44, marginBottom: 10 }} />
              <p className="text-sm font-medium">ยังไม่มีไฟล์สลิป</p>
              <p className="text-[12px] mt-1 text-gray-500 text-center px-2">
                คลิกเพื่อเลือกไฟล์ หรือ ลากไฟล์มาวางที่นี่
              </p>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Result Preview (optional) */}
          <div className="mt-4">
            <div className="text-xs font-semibold text-gray-800 mb-2">Result (แสดงไว้ดู + ก็มี console.log แล้ว)</div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <pre className="text-[11px] leading-5 text-gray-700 whitespace-pre-wrap break-words">
                {result ? JSON.stringify(result, null, 2) : "ยังไม่มีผลลัพธ์ (กด Submit เพื่อเรียก API)"}
              </pre>
            </div>
          </div>
        </div>
      </main>

      {/* Bottom Bar */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-screen-sm items-center gap-3 px-4 py-3">
          <button
            onClick={handleUploadClick}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 transition"
            type="button"
          >
            <FaUpload />
            <span className="text-sm font-semibold">Upload</span>
          </button>

          <button
            onClick={handleSubmit}
            disabled={!uploadedFile || loading}
            className={`flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-white transition ${
              uploadedFile && !loading
                ? "bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 active:from-blue-800 active:to-blue-700"
                : "bg-blue-300 cursor-not-allowed"
            }`}
            type="button"
          >
            <FaPaperPlane />
            <span className="text-sm font-semibold">Submit</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default UploadSlipOnly;
