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
        message.error("Unable to retrieve user data");
      }
    };
    loadUser();
  }, []);

  const onChange = ({ fileList: newFileList }: any) => {
    // จำกัดอัปโหลดได้ 1 ไฟล์เสมอ
    setFileList(newFileList.slice(-1));
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
      message.error("User information not found");
      return;
    }

    if (!description.trim()) {
      message.error("Please fill in the description");
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
        message.success("Report submitted");
        setDescription("");
        setFileList([]);
        onClose();
      } else {
        message.error("An error occurred while submitting the report");
      }
    } catch (error) {
      console.error("submit error:", error);
      message.error("An error occurred while submitting the report");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      {/* การ์ดหลักสไตล์เดียวกับ Bill/EditCar/EditUser */}
      <div className="w-full max-w-xl mx-auto rounded-[26px] bg-white shadow-xl overflow-hidden">
        <form onSubmit={handleSubmit} className="flex flex-col">
          {/* HEADER – Gradient + Icon + Title + ปุ่ม X */}
          <div className="bg-gradient-to-r from-blue-600 to-sky-500 px-5 sm:px-6 py-4 flex items-center justify-between text-white">
            <div className="flex items-center gap-3 min-w-0">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15">
                <FaBolt className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex flex-col">
                <span className="text-sm sm:text-base font-semibold truncate">
                  Station / Usage Report
                </span>
                <span className="text-[11px] text-blue-100 truncate">
                  Tell us about issues with this station
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  d="M6 6l12 12M6 18L18 6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>

          {/* BODY – upload + description, พื้นหลังฟ้าอ่อน, scroll ได้ */}
          <div
            className="px-5 sm:px-6 pt-4 pb-5 bg-blue-50/40 space-y-4"
            style={{
              maxHeight: "60vh",
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
            }}
          >
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
                      message.error("Please upload only image files");
                      return Upload.LIST_IGNORE;
                    }
                    // ปิดอัปโหลดอัตโนมัติ ใช้แบบ manual
                    return false;
                  }}
                  maxCount={1}
                  listType="picture-card"
                  className="[&_.ant-upload]:!rounded-xl [&_.ant-upload]:!border-blue-100"
                >
                  {fileList.length < 1 && (
                    <div className="flex h-full w-full flex-col items-center justify-center text-gray-500 transition hover:text-blue-600">
                      <PlusOutlined style={{ fontSize: 24 }} />
                      <div className="mt-2 text-[13px] font-medium">
                        Add a photo
                      </div>
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
          </div>

          {/* FOOTER – ปุ่ม Cancel / Submit แบบเดียวกับ modals อื่น */}
          <div className="px-5 sm:px-6 py-4 bg-white border-t border-blue-100 flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 h-11 rounded-xl border border-blue-200 bg-white text-sm font-semibold text-blue-700 hover:bg-blue-50 active:scale-[0.99] focus:outline-none focus:ring-4 focus:ring-blue-100 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`px-4 h-11 rounded-xl text-sm font-semibold text-white shadow-sm transition focus:outline-none focus:ring-4 focus:ring-blue-200 active:scale-[0.99] ${
                loading
                  ? "bg-blue-300 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800"
              }`}
            >
              {loading ? "Sending..." : "Submit report"}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
};

export default ReportModal;
