import React, { useState, useEffect } from "react";
import { Modal, Input, message } from "antd";
import { FaEdit, FaTag } from "react-icons/fa";
import { X } from "react-feather";
import { UpdateBrandByID } from "../../../../services";
import type { BrandInterface } from "../../../../interface/IBrand";

interface UpdateBrandModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  brandID: number;
  initialName: string;
}

const UpdateBrandModal: React.FC<UpdateBrandModalProps> = ({
  open,
  onClose,
  onSuccess,
  brandID,
  initialName,
}) => {
  const [brandName, setBrandName] = useState(initialName);
  const [loading, setLoading] = useState(false);

  // รีเซ็ตค่าเมื่อเปิด modal ใหม่ (กัน state ค้างจากรอบก่อน)
  useEffect(() => {
    if (open) {
      setBrandName(initialName);
    }
  }, [open, initialName]);

  if (!open) return null;

  const handleSave = async () => {
    if (!brandName.trim()) {
      message.warning("Please enter a brand name.");
      return;
    }

    setLoading(true);
    const updateBrand: Partial<BrandInterface> = { BrandName: brandName.trim() };
    const res = await UpdateBrandByID(brandID, updateBrand);
    setLoading(false);

    if (!res) {
      message.error("Failed to update brand.");
      return;
    }

    if ("error" in res) {
      if (res.error.includes("ชื่อยี่ห้อนี้มีอยู่แล้ว")) {
        message.warning("This brand name already exists. Please use another name.");
      } else {
        message.error(res.error || "Failed to update brand.");
      }
      return;
    }

    // Handle various success shapes from backend
    if ("data" in res && res.data && "BrandName" in res.data) {
      message.success("Brand updated successfully.");
      onSuccess();
      onClose();
    } else if ("BrandName" in res) {
      message.success("Brand updated successfully.");
      onSuccess();
      onClose();
    } else if ("message" in res) {
      message.success(res.message || "Brand updated successfully.");
      onSuccess();
      onClose();
    } else {
      message.error("Unable to update brand.");
    }
  };

  const canSubmit = !!brandName.trim();

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      centered
      destroyOnClose
      closable={false}
      width={420}
      className="ev-scope max-w-full md:max-w-[420px]"
      bodyStyle={{ padding: 0, background: "transparent" }}
      styles={{
        content: {
          background: "transparent",
          boxShadow: "none",
          padding: 0,
        },
      }}
    >
      <div className="w-full max-w-[420px] mx-auto rounded-2xl bg-white shadow-xl ring-1 ring-blue-100 overflow-hidden flex flex-col">
        {/* HEADER */}
        <div className="relative bg-gradient-to-r from-blue-600 to-sky-500 px-5 pt-3 pb-4 text-white">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-white/15">
                <FaEdit className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base md:text-lg font-semibold">
                  Edit brand
                </h2>
                <p className="text-[11px] text-blue-100">
                  Update the brand name in your EV car catalog.
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              aria-label="Close modal"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15 hover:bg-white/25 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* BODY */}
        <div className="px-5 md:px-6 py-6 bg-slate-50/70">
          <div className="mb-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200">
              <FaTag className="text-blue-500" />
              Brand information
            </span>
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-xs text-slate-600 flex items-center gap-2">
              <FaTag className="text-blue-500" /> Brand name
            </span>
            <Input
              size="large"
              placeholder="Enter brand name..."
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              className="rounded-xl border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-300"
              allowClear
            />
          </label>
        </div>

        {/* FOOTER */}
        <div className="px-5 md:px-6 py-4 bg-white border-t border-slate-200 flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 h-10 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 transition active:scale-[0.99]"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSubmit || loading}
            className={`px-4 h-10 rounded-xl text-white text-sm font-semibold shadow-sm transition active:scale-[0.99] ${
              canSubmit && !loading
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-blue-300 cursor-not-allowed"
            }`}
          >
            {loading ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default UpdateBrandModal;
