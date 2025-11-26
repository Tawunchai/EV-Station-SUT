import { useState, useEffect } from "react";
import Modal from "./modal";
import { CreateReport } from "../../../../services";
import { message, Upload } from "antd";
import ImgCrop from "antd-img-crop";
import { PlusOutlined } from "@ant-design/icons";
import { AiOutlineFileText, AiOutlineUpload } from "react-icons/ai";
import { FaBolt } from "react-icons/fa";
import { getCurrentUser, initUserProfile } from "../../../../services/httpLogin";

type Props = {
  open: boolean;
  onClose: () => void;
};

const ReportModal = ({ open, onClose }: Props) => {
  const [description, setDescription] = useState("");
  const [fileList, setFileList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [userID, setUserID] = useState<number | undefined>(undefined);

  // ✅ โหลด userID จาก JWT (cookie)
  useEffect(() => {
    const loadUser = async () => {
      try {
        let current = getCurrentUser();
        if (!current) current = await initUserProfile();

        const uid = current?.id;
        setUserID(uid);
      } catch (error) {
        console.error("load user error:", error);
        message.error("ไม่สามารถดึงข้อมูลผู้ใช้ได้");
      }
    };
    loadUser();
  }, []);

  const onChange = ({ fileList: newFileList }: any) => {
    setFileList(newFileList.slice(-1)); // จำกัดอัปโหลดได้ 1 ไฟล์เสมอ
  };

  const onPreview = async (file: any) => {
    let src = file.url;
    if (!src && file.originFileObj) {
      src = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file.originFileObj);
        reader.onload = () => resolve(reader.result as string);
      });
    }
    const win = window.open(src);
    win?.document.write(`<img src="${src}" style="max-width: 100%;" />`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!userID) {
      message.error("ไม่พบข้อมูลผู้ใช้");
      return;
    }

    if (!description.trim()) {
      message.error("กรุณากรอกคำอธิบาย");
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("description", description.trim());
      formData.append("userID", String(userID));

      if (fileList[0]?.originFileObj) {
        formData.append("picture", fileList[0].originFileObj);
      }

      const ok = await CreateReport(formData);
      if (ok) {
        message.success("รายงานถูกส่งเรียบร้อยแล้ว");
        setDescription("");
        setFileList([]);
        onClose();
      } else {
        message.error("เกิดข้อผิดพลาดในการส่งรายงาน");
      }
    } catch (error) {
      console.error("submit error:", error);
      message.error("เกิดข้อผิดพลาดในการส่งรายงาน");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-6">
        {/* Header – Pill + Title */}
        <div className="flex items-center justify-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 ring-1 ring-inset ring-blue-100">
            <FaBolt className="text-blue-600" />
            <span className="text-sm font-semibold text-blue-700">
              Station/Usage Report
            </span>
          </span>
        </div>

        {/* Upload block */}
        <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
          <label className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-800">
            <AiOutlineUpload size={20} />
            Upload a photo (optional)
          </label>

          <ImgCrop rotationSlider>
            <Upload
              fileList={fileList}
              onChange={onChange}
              onPreview={onPreview}
              beforeUpload={(file) => {
                const isImage = file.type.startsWith("image/");
                if (!isImage) {
                  message.error("กรุณาอัปโหลดไฟล์รูปภาพเท่านั้น");
                  return Upload.LIST_IGNORE;
                }
                return false; // ปิดอัปโหลดอัตโนมัติ
              }}
              maxCount={1}
              listType="picture-card"
              className="[&_.ant-upload]:!rounded-xl [&_.ant-upload]:!border-blue-100"
            >
              {fileList.length < 1 && (
                <div className="flex h-full w-full flex-col items-center justify-center text-gray-500 transition hover:text-blue-600">
                  <PlusOutlined style={{ fontSize: 24 }} />
                  <div className="mt-2 text-[13px] font-medium">Add a photo</div>
                </div>
              )}
            </Upload>
          </ImgCrop>

          <p className="mt-2 text-xs text-gray-500">
            Support JPEG/PNG • 1 image • Crop before sending
          </p>
        </div>

        {/* Description block */}
        <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
          <label className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-800">
            <AiOutlineFileText size={20} />
            Detailed description <span className="text-red-500">*</span>
          </label>
          <textarea
            className="w-full rounded-xl border border-blue-100 bg-white p-3 text-[15px] text-gray-900
                       placeholder-gray-400 shadow-sm transition focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
            rows={5}
            required
            placeholder="Describe the problem or issue you want to report, such as a broken charger, an unusable station, etc."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-11 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className={`flex-1 h-11 rounded-xl text-sm font-semibold text-white shadow-sm transition
              ${
                loading
                  ? "bg-blue-300 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800"
              }`}
          >
            {loading ? "กำลังส่ง..." : "ส่งรายงาน"}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default ReportModal;
