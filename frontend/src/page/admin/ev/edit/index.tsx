import React, { useEffect, useState } from "react";
import { Upload, message, Select } from "antd";
import ImgCrop from "antd-img-crop";
import { StatusInterface } from "../../../../interface/IStatus";
import { TypeInterface } from "../../../../interface/IType";
import {
  UpdateEVByID,
  ListCabinetsEV,
  apiUrlPicture,
  ListEnergySource,
} from "../../../../services";
import { getCurrentUser, initUserProfile } from "../../../../services/httpLogin";
import {
  FaTimes,
  FaEdit,
  FaImage,
  FaTag,
  FaMoneyBillWave,
  FaListAlt,
  FaInfoCircle,
  FaChargingStation,
  FaBolt,
} from "react-icons/fa";
import { EnergySourceInterface } from "../../../../interface/IEnergySource";

interface EditEVModalProps {
  open: boolean;
  onClose: () => void;
  evCharging: any;
  onSaved: () => void;
  statusList: StatusInterface[];
  typeList: TypeInterface[];
}

interface CabinetInterface {
  ID: number;
  Name: string;
  Location: string;
}

const EditEVModal: React.FC<EditEVModalProps> = ({
  open,
  onClose,
  evCharging,
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

  // ⭐ multi-cabinet
  const [selectedCabinets, setSelectedCabinets] = useState<number[]>([]);

  const [fileList, setFileList] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [employeeID, setEmployeeID] = useState<number | null>(null);
  const [cabinets, setCabinets] = useState<CabinetInterface[]>([]);

  // โหลด employee
  useEffect(() => {
    const fetchEmployee = async () => {
      try {
        await initUserProfile();
        const currentUser = getCurrentUser();
        if (currentUser?.employee_id) {
          setEmployeeID(currentUser.employee_id);
        }
      } catch {
        message.error("โหลดข้อมูลผู้ใช้ล้มเหลว");
      }
    };
    fetchEmployee();
  }, []);

  // โหลด Cabinets + EnergySource ตอนเปิด modal
  useEffect(() => {
    const fetchCab = async () => {
      try {
        const res = await ListCabinetsEV();
        if (Array.isArray(res)) setCabinets(res);
        else setCabinets([]);
      } catch {
        message.error("โหลดข้อมูล Cabinet ไม่สำเร็จ");
      }
    };

    const fetchEnergySource = async () => {
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
      fetchEnergySource();
    }
  }, [open]);

  // โหลดข้อมูล EV ที่จะ edit
  useEffect(() => {
    if (!open || !evCharging) return;

    setName(evCharging.Name ?? "");
    setDescription(evCharging.Description ?? "");
    setPrice(
      evCharging.Price !== undefined && evCharging.Price !== null
        ? String(evCharging.Price)
        : ""
    );

    setStatusID(evCharging.StatusID ?? undefined);
    setTypeID(evCharging.TypeID ?? undefined);

    // ⭐ ตั้งค่า EnergySource จากข้อมูลเดิม
    if (evCharging.EnergySourceID) {
      setEnergySourceID(evCharging.EnergySourceID);
    } else if (evCharging.EnergySource?.ID) {
      setEnergySourceID(evCharging.EnergySource.ID);
    } else {
      setEnergySourceID(undefined);
    }

    // ⭐ multi cabinet → เซ็ตค่าเป็น array [1, 2, 3]
    if (Array.isArray(evCharging.Cabinets)) {
      setSelectedCabinets(evCharging.Cabinets.map((c: any) => c.ID));
    } else {
      setSelectedCabinets([]);
    }

    // โหลดรูป
    if (evCharging.Picture) {
      setFileList([
        {
          uid: "-1",
          name: "current_image.jpg",
          status: "done",
          url: apiUrlPicture + evCharging.Picture,
          originFileObj: null,
        },
      ]);
    } else {
      setFileList([]);
    }
  }, [open, evCharging]);

  const isMobile =
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 768px)").matches;

  // Submit update
  const handleSubmit = async () => {
    if (!evCharging?.ID) return message.error("ข้อมูล EV ไม่ถูกต้อง");

    if (
      !name ||
      !description ||
      !price ||
      !statusID ||
      !typeID ||
      !energySourceID || // ⭐ บังคับให้เลือก Energy Source
      selectedCabinets.length === 0
    ) {
      return message.error("กรุณากรอกข้อมูลให้ครบถ้วน");
    }

    const formData = new FormData();
    formData.append("name", name);
    formData.append("description", description);
    formData.append("price", price);
    formData.append("statusID", String(statusID));
    formData.append("typeID", String(typeID));

    // ⭐ ส่ง Energy Source ID ไป backend
    formData.append("energySourceID", String(energySourceID));

    // ⭐ ส่งหลาย cabinet เช่น "1,3,5"
    formData.append("cabinetIDs", selectedCabinets.join(","));

    if (employeeID) formData.append("employeeID", String(employeeID));

    // ถ้ามีการอัปโหลดรูปใหม่
    if (fileList.length > 0 && fileList[0].originFileObj) {
      formData.append("picture", fileList[0].originFileObj);
    }

    try {
      setSubmitting(true);
      const result = await UpdateEVByID(evCharging.ID, formData);

      if (result) {
        message.success("บันทึกการแก้ไขสำเร็จ");
        onSaved();
        onClose();
      } else {
        message.error("บันทึกไม่สำเร็จ");
      }
    } catch (err) {
      message.error("เกิดข้อผิดพลาด");
    } finally {
      setSubmitting(false);
    }
  };

  // preview image
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
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      <div className="relative w-full max-w-[600px] mx-4 mb-10">
        <div
          className="bg-white rounded-2xl shadow-2xl ring-1 ring-blue-200 flex flex-col overflow-hidden"
          style={{ maxHeight: isMobile ? "80vh" : "85vh" }}
        >
          {/* HEADER */}
          <div className="px-5 py-4 bg-blue-600 text-white flex justify-between items-center">
            <div className="flex items-center gap-2">
              <FaEdit />
              <h2 className="text-lg font-semibold">แก้ไข EV Charging</h2>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg">
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
                      <span className="text-sm">Upload</span>
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
                  <FaChargingStation className="text-blue-500" /> ตู้ชาร์จ (เลือกหลายตัว)
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
              className="px-4 py-2 rounded-xl border border-blue-200"
            >
              ยกเลิก
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white"
            >
              {submitting ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditEVModal;