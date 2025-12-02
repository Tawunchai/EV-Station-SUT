import React, { useState, useEffect } from "react";
import { Input, Button, Spin, message } from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import {
  CreateModal,
  UpdateModalByID,
  DeleteModalByID,
} from "../../../../services";
import type { ModalInterface } from "../../../../interface/ICarCatalog";
import { FaTags, FaTimes, FaCar } from "react-icons/fa";

interface BrandDetailModalProps {
  open: boolean;
  onClose: () => void;
  brandName: string;
  brandID: number;
  models: ModalInterface[];
  onReload: () => Promise<void>;
}

const BrandDetailModal: React.FC<BrandDetailModalProps> = ({
  open,
  onClose,
  brandName,
  brandID,
  models,
  onReload,
}) => {
  const [localModels, setLocalModels] = useState<ModalInterface[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newModel, setNewModel] = useState("");
  const [editingID, setEditingID] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setLocalModels(models);
      setIsAdding(false);
      setEditingID(null);
      setNewModel("");
    }
  }, [open, models]);

  if (!open) return null;

  // ✅ เพิ่มรุ่นใหม่
  const handleCreate = async () => {
    if (!newModel.trim()) {
      message.warning("Please enter the model name first.");
      return;
    }
    setLoading(true);
    try {
      const res = await CreateModal({ ModalName: newModel, BrandID: brandID });
      if (res) {
        setLocalModels((prev) => [...prev, res]);
        setNewModel("");
        setIsAdding(false);
        message.success("Successfully added Model");
        await onReload(); // ✅ reload ข้อมูลหลัก
      } else {
        message.error("Unable to add Model");
      }
    } catch {
      message.error("An error occurred while adding the Model");
    } finally {
      setLoading(false);
    }
  };

  // ✅ อัปเดตรุ่น
  const handleUpdate = async (id: number) => {
    if (!editingName.trim()) {
      message.warning("กรุณากรอกชื่อรุ่นใหม่ก่อน");
      return;
    }
    setLoading(true);
    try {
      const res = await UpdateModalByID(id, {
        ModalName: editingName,
        BrandID: brandID,
      });
      if (res) {
        setLocalModels((prev) =>
          prev.map((m) => (m.ID === id ? { ...m, ModalName: editingName } : m))
        );
        setEditingID(null);
        setEditingName("");
        message.success("Successfully updated Model");
        await onReload(); // ✅ reload ข้อมูลหลัก
      } else {
        message.error("Unable to update Model");
      }
    } catch {
      message.error("An error occurred while updating the Model");
    } finally {
      setLoading(false);
    }
  };

  // ✅ ลบรหัสรุ่น
  const handleDelete = async (id: number) => {
    setLoading(true);
    try {
      const ok = await DeleteModalByID(id);
      if (ok) {
        setLocalModels((prev) => prev.filter((m) => m.ID !== id));
        message.success("Successfully deleted the model");
        await onReload(); // ✅ reload ข้อมูลหลัก
      } else {
        message.error("Unable to delete model");
      }
    } catch {
      message.error("An error occurred while deleting the model");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-end md:items-center justify-center ev-scope"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-[500px] mx-4 md:mx-auto mb-8 md:mb-0 animate-[fadeIn_0.25s_ease]">
        <div className="bg-white rounded-2xl shadow-2xl ring-1 ring-blue-100 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-5 pt-3 pb-4 bg-gradient-to-r from-blue-600 to-sky-500 text-white flex justify-between items-center shadow-md">
            <div className="flex items-center gap-2">
              <FaTags className="opacity-90 text-lg" />
              <h2 className="text-base md:text-lg font-semibold tracking-wide">
                รุ่นของ {brandName}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 -m-2 rounded-lg hover:bg-white/10 transition"
              aria-label="ปิดหน้าต่าง"
            >
              <FaTimes />
            </button>
          </div>

          {/* Body */}
          <div
            className="px-5 py-5 bg-blue-50/40 overflow-y-auto"
            style={{ maxHeight: "60vh" }}
          >
            {loading ? (
              <div className="flex justify-center items-center h-40">
                <Spin size="large" />
              </div>
            ) : (
              <>
                {localModels.length === 0 ? (
                  <p className="text-center text-gray-400 py-2">
                    ยังไม่มีรุ่นในยี่ห้อนี้
                  </p>
                ) : (
                  <ul className="divide-y divide-blue-100">
                    {localModels.map((m) => (
                      <li
                        key={m.ID}
                        className="flex justify-between items-center py-2 px-2 hover:bg-blue-100/50 rounded-lg transition"
                      >
                        {editingID === m.ID ? (
                          <div className="flex gap-2 w-full">
                            <Input
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              placeholder="ชื่อรุ่นใหม่"
                              size="small"
                              className="rounded-lg border-blue-300"
                            />
                            <Button
                              icon={<SaveOutlined />}
                              type="primary"
                              size="small"
                              className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm"
                              onClick={() => handleUpdate(m.ID)}
                            />
                            <Button
                              size="small"
                              danger
                              className="rounded-lg"
                              onClick={() => setEditingID(null)}
                            >
                              ยกเลิก
                            </Button>
                          </div>
                        ) : (
                          <>
                            <span className="text-gray-700 flex items-center gap-2 truncate">
                              <FaCar className="text-blue-500" /> {m.ModalName}
                            </span>
                            <div className="flex gap-1">
                              <Button
                                icon={<EditOutlined />}
                                size="small"
                                className="text-blue-600 hover:text-blue-800 rounded-lg"
                                onClick={() => {
                                  setEditingID(m.ID);
                                  setEditingName(m.ModalName);
                                }}
                              />
                              <Button
                                icon={<DeleteOutlined />}
                                size="small"
                                danger
                                className="rounded-lg"
                                onClick={() => handleDelete(m.ID)}
                              />
                            </div>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {/* เพิ่มรุ่นใหม่ */}
            {isAdding ? (
              <div className="flex gap-2 mt-5">
                <Input
                  placeholder="ชื่อรุ่นใหม่..."
                  value={newModel}
                  onChange={(e) => setNewModel(e.target.value)}
                  className="rounded-lg border-blue-300 focus:border-blue-400"
                />
                <Button
                  type="primary"
                  onClick={handleCreate}
                  className="bg-gradient-to-r from-blue-500 to-sky-400 text-white font-semibold rounded-lg shadow-sm hover:shadow-md transition"
                >
                  เพิ่ม
                </Button>
                <Button
                  onClick={() => setIsAdding(false)}
                  className="rounded-lg border border-gray-300 hover:bg-gray-100"
                >
                  ยกเลิก
                </Button>
              </div>
            ) : (
              <Button
                onClick={() => setIsAdding(true)}
                block
                icon={<PlusOutlined />}
                className="mt-5 rounded-xl bg-gradient-to-r from-blue-500 to-sky-400 text-white font-semibold shadow-md hover:shadow-lg hover:from-blue-600 hover:to-sky-500 transition h-10"
              >
                เพิ่มรุ่นใหม่
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Animation */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default BrandDetailModal;
