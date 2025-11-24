import React, { useEffect, useState } from "react";
import { Upload, message, Select } from "antd";
import ImgCrop from "antd-img-crop";
import { StatusInterface } from "../../../../interface/IStatus";
import { TypeInterface } from "../../../../interface/IType";
import { CreateEV, ListCabinetsEV, ListEnergySource } from "../../../../services/index";
import { getCurrentUser, initUserProfile } from "../../../../services/httpLogin";
import {
  FaTimes,
  FaBolt,
  FaImage,
  FaTag,
  FaMoneyBillWave,
  FaListAlt,
  FaInfoCircle,
  FaChargingStation,
} from "react-icons/fa";
import { EnergySourceInterface } from "../../../../interface/IEnergySource";

interface CreateEVModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  statusList: StatusInterface[];
  typeList: TypeInterface[];
}

interface CabinetInterface {
  ID: number;
  Name: string;
  Location: string;
}

const CreateEVModal: React.FC<CreateEVModalProps> = ({
  open,
  onClose,
  onSaved,
  statusList,
  typeList,
}) => {
  const [name, setName] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [price, setPrice] = useState<string>("");

  const [statusID, setStatusID] = useState<number | undefined>(undefined);
  const [typeID, setTypeID] = useState<number | undefined>(undefined);

  // ⭐ Energy Source (Solar / Grid)
  const [energySourceID, setEnergySourceID] = useState<number | undefined>(undefined);
  const [energySourceList, setEnergySourceList] = useState<EnergySourceInterface[]>([]);

  // ⭐ เลือกหลาย Cabinet
  const [selectedCabinets, setSelectedCabinets] = useState<number[]>([]);

  const [fileList, setFileList] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const [cabinets, setCabinets] = useState<CabinetInterface[]>([]);
  const [employeeID, setEmployeeID] = useState<number | null>(null);

  // โหลด employee_id
  useEffect(() => {
    const fetchEmployee = async () => {
      try {
        await initUserProfile();
        const currentUser = getCurrentUser();
        if (currentUser?.employee_id) {
          setEmployeeID(currentUser.employee_id);
        } else {
          message.warning("ไม่พบรหัสพนักงาน กรุณาเข้าสู่ระบบใหม่");
        }
      } catch {
        message.error("โหลดข้อมูลผู้ใช้ล้มเหลว");
      }
    };
    fetchEmployee();
  }, []);

  // โหลด Cabinet + EnergySource ตอนเปิด modal
  useEffect(() => {
    const fetchCab = async () => {
      try {
        const res = await ListCabinetsEV();
        if (Array.isArray(res)) {
          setCabinets(res);
        } else {
          setCabinets([]);
        }
      } catch {
        message.error("โหลดข้อมูล Cabinet ไม่สำเร็จ");
      }
    };

    const fetchEnergySources = async () => {
      try {
        const res = await ListEnergySource();
        if (Array.isArray(res)) {
          setEnergySourceList(res);
        } else {
          setEnergySourceList([]);
        }
      } catch {
        message.error("โหลดข้อมูล Energy Source ไม่สำเร็จ");
      }
    };

    if (open) {
      fetchCab();
      fetchEnergySources();
    }
  }, [open]);

  // Reset เมื่อเปิด modal
  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setPrice("");
      setStatusID(undefined);
      setTypeID(undefined);
      setEnergySourceID(undefined);
      setSelectedCabinets([]); // reset
      setFileList([]);
      setSubmitting(false);
    }
  }, [open]);

  const isMobile =
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 768px)").matches;

  // Submit
  const handleSubmit = async () => {
    if (
      !name ||
      !description ||
      !price ||
      !statusID ||
      !typeID ||
      !energySourceID || // ⭐ ต้องเลือก Energy Source ด้วย
      selectedCabinets.length === 0 ||
      fileList.length === 0
    ) {
      message.error("กรุณากรอกข้อมูลให้ครบถ้วน");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("name", name);
      formData.append("description", description);
      formData.append("price", price);
      formData.append("statusID", String(statusID));
      formData.append("typeID", String(typeID));

      // ⭐ ส่ง Energy Source ID → backend (key ต้องตรงกับ Go: energySourceID)
      formData.append("energySourceID", String(energySourceID));

      // ⭐ ส่งหลายตู้ → "1,3,5"
      formData.append("cabinetIDs", selectedCabinets.join(","));

      if (employeeID) formData.append("employeeID", String(employeeID));

      formData.append("picture", fileList[0].originFileObj);

      const result = await CreateEV(formData);
      if (result) {
        message.success("สร้างข้อมูลสำเร็จ");
        onSaved();
        onClose();
      } else {
        message.error("ไม่สามารถสร้างข้อมูลได้");
      }
    } catch {
      message.error("เกิดข้อผิดพลาด");
    } finally {
      setSubmitting(false);
    }
  };

  // Preview รูป
  const onPreview = async (file: any) => {
    let src = file.url;
    if (!src && file.originFileObj) {
      src = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file.originFileObj);
        reader.onload = () => resolve(reader.result as string);
      });
    }
    const imgWindow = window.open(src as string);
    imgWindow?.document.write(`<img src="${src}" style="max-width: 100%;" />`);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={submitting ? undefined : onClose}
      />

      <div className="relative w-full max-w-[600px] mx-4 md:mx-auto mb-8 md:mb-0">
        <div
          className="bg-white rounded-2xl shadow-xl ring-1 ring-blue-100 flex flex-col overflow-hidden"
          style={{ maxHeight: isMobile ? "78vh" : "82vh" }}
        >
          {/* HEADER */}
          <div className="px-5 py-4 bg-blue-600 text-white flex justify-between items-center">
            <div className="flex items-center gap-2">
              <FaBolt />
              <h2 className="text-lg font-semibold">เพิ่มข้อมูล EV Charging</h2>
            </div>
            <button
              onClick={onClose}
              disabled={submitting}
              className="p-2 hover:bg-white/10 rounded-lg"
            >
              <FaTimes />
            </button>
          </div>

          {/* BODY */}
          <div className="px-5 py-5 bg-blue-50/40 space-y-4 overflow-y-auto">
            {/* Upload */}
            <div className="flex justify-center">
              <ImgCrop rotationSlider>
                <Upload
                  accept="image/*"
                  listType="picture-card"
                  fileList={fileList}
                  onChange={({ fileList }) => setFileList(fileList)}
                  onPreview={onPreview}
                  beforeUpload={() => false}
                  maxCount={1}
                >
                  {fileList.length < 1 && (
                    <div className="flex flex-col items-center text-blue-500">
                      <FaImage size={24} />
                      <span className="mt-1 text-sm">Upload</span>
                    </div>
                  )}
                </Upload>
              </ImgCrop>
            </div>

            {/* FORM */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* NAME */}
              <label className="flex flex-col gap-1">
                <span className="text-xs flex items-center gap-2">
                  <FaTag className="text-blue-500" /> ชื่อสถานี
                </span>
                <input
                  className="px-3 py-2 rounded-xl border"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>

              {/* PRICE */}
              <label className="flex flex-col gap-1">
                <span className="text-xs flex items-center gap-2">
                  <FaMoneyBillWave className="text-blue-500" /> ราคา (บาท)
                </span>
                <input
                  type="number"
                  className="px-3 py-2 rounded-xl border"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </label>

              {/* STATUS */}
              <label className="flex flex-col gap-1">
                <span className="text-xs flex items-center gap-2">
                  <FaListAlt className="text-blue-500" /> สถานะ
                </span>
                <Select
                  className="w-full"
                  placeholder="เลือกสถานะ"
                  value={statusID}
                  onChange={(v) => setStatusID(v)}
                  options={statusList.map((s) => ({
                    label: s.Status,
                    value: s.ID,
                  }))}
                  allowClear
                  size="large"
                />
              </label>

              {/* TYPE */}
              <label className="flex flex-col gap-1">
                <span className="text-xs flex items-center gap-2">
                  <FaInfoCircle className="text-blue-500" /> ประเภท
                </span>
                <Select
                  className="w-full"
                  placeholder="เลือกประเภท"
                  value={typeID}
                  onChange={(v) => setTypeID(v)}
                  options={typeList.map((t) => ({
                    label: t.Type,
                    value: t.ID,
                  }))}
                  allowClear
                  size="large"
                />
              </label>

              {/* ENERGY SOURCE */}
              <label className="flex flex-col gap-1 md:col-span-2">
                <span className="text-xs flex items-center gap-2">
                  <FaBolt className="text-blue-500" /> แหล่งพลังงาน (Energy Source)
                </span>
                <Select
                  className="w-full"
                  placeholder="เลือกแหล่งพลังงาน เช่น Solar / Grid"
                  value={energySourceID}
                  onChange={(v) => setEnergySourceID(v)}
                  options={energySourceList.map((es) => ({
                    label: es.Name,
                    value: es.ID,
                  }))}
                  allowClear
                  size="large"
                />
              </label>

              {/* MULTI CABINET */}
              <label className="flex flex-col gap-1 md:col-span-2">
                <span className="text-xs flex items-center gap-2">
                  <FaChargingStation className="text-blue-500" /> ตู้ชาร์จ (เลือกได้หลายตัว)
                </span>
                <Select
                  mode="multiple"
                  className="w-full"
                  placeholder="เลือก Cabinet"
                  value={selectedCabinets}
                  onChange={(values) => setSelectedCabinets(values)}
                  options={cabinets.map((c) => ({
                    label: `${c.Name} (${c.Location || "ไม่ระบุ"})`,
                    value: c.ID,
                  }))}
                  allowClear
                  showSearch
                  size="large"
                />
              </label>

              {/* DESCRIPTION */}
              <label className="flex flex-col gap-1 md:col-span-2">
                <span className="text-xs flex items-center gap-2">
                  <FaInfoCircle className="text-blue-500" /> รายละเอียด
                </span>
                <textarea
                  rows={3}
                  className="px-3 py-2 rounded-xl border"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
            </div>
          </div>

          {/* FOOTER */}
          <div className="px-5 py-4 bg-white border-t flex justify-end gap-2">
            <button
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-xl border"
            >
              ยกเลิก
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white"
            >
              {submitting ? "กำลังบันทึก..." : "สร้าง"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateEVModal;