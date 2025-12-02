import React, { useMemo, useState, useEffect, useRef } from "react";
import { Modal, Checkbox, Input, message } from "antd";
import { CarsInterface } from "../../../../../../interface/ICar";
import {
  UpdateCarByID,
  ListCars,
  ListModals,
} from "../../../../../../services";
import type { ModalInterface } from "../../../../../../interface/ICarCatalog";
import {
  FaCarSide,
  FaCity,
  FaTags,
  FaBolt,
  FaTimes,
} from "react-icons/fa";

/* ===========================
   Props
   =========================== */

interface EditCarModalProps {
  open: boolean;
  onClose: () => void;
  car?: CarsInterface | null;
  onUpdated: (updated: CarsInterface) => void;
}

/* ===========================
   Custom Select Component
   =========================== */

type Option = { label: string; value: string };

interface EVSelectProps {
  value?: string;
  placeholder?: string;
  options: Option[];
  disabled?: boolean;
  onChange: (val: string | undefined) => void;
}

const EVSelect: React.FC<EVSelectProps> = ({
  value,
  placeholder,
  options,
  disabled,
  onChange,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const selectedLabel =
    options.find((o) => o.value === value)?.label ?? "";

  // ปิด dropdown เมื่อคลิกนอก component
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between rounded-xl border px-3 py-2.5 text-sm md:text-base bg-white transition
          ${
            disabled
              ? "border-slate-200 text-slate-400 cursor-not-allowed bg-slate-50"
              : "border-slate-300 text-slate-900 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
          }`}
      >
        <span
          className={
            value ? "text-slate-900" : "text-slate-400 select-none"
          }
        >
          {value ? selectedLabel : placeholder || "Select"}
        </span>
        <svg
          viewBox="0 0 24 24"
          className={`h-4 w-4 text-slate-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && !disabled && (
        <div className="absolute z-20 mt-1 w-full rounded-xl bg-white shadow-lg ring-1 ring-slate-200 max-h-60 overflow-y-auto">
          {options.length === 0 && (
            <div className="px-3 py-2 text-sm text-slate-400">
              No options
            </div>
          )}
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`w-full px-3 py-2 text-left text-sm md:text-base hover:bg-slate-50 ${
                opt.value === value ? "bg-blue-50 text-blue-700" : ""
              }`}
            >
              {opt.label}
            </button>
          ))}

          {/* ปุ่มล้างค่า */}
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
              className="w-full px-3 py-2 text-left text-xs text-red-500 border-t border-slate-100 hover:bg-red-50"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
};

/* ===========================
   MAIN MODAL COMPONENT
   =========================== */

const EditCarModal: React.FC<EditCarModalProps> = ({
  open,
  onClose,
  car,
  onUpdated,
}) => {
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [plate, setPlate] = useState("");
  const [province, setProvince] = useState("");
  const [isSpecialReg, setIsSpecialReg] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  // สำหรับตรวจทะเบียนซ้ำ
  const [allCars, setAllCars] = useState<CarsInterface[]>([]);
  const [plateError, setPlateError] = useState<string | null>(null);

  // Catalog Brand/Model
  const [modals, setModals] = useState<ModalInterface[]>([]);

  const baseProvinces = [
    "กระบี่",
    "กรุงเทพมหานคร",
    "กาญจนบุรี",
    "กาฬสินธุ์",
    "กำแพงเพชร",
    "ขอนแก่น",
    "จันทบุรี",
    "ฉะเชิงเทรา",
    "ชลบุรี",
    "ชัยนาท",
    "ชัยภูมิ",
    "ชุมพร",
    "เชียงราย",
    "เชียงใหม่",
    "ตรัง",
    "ตราด",
    "ตาก",
    "นครนายก",
    "นครปฐม",
    "นครพนม",
    "นครราชสีมา",
    "นครศรีธรรมราช",
    "นครสวรรค์",
    "นนทบุรี",
    "นราธิวาส",
    "น่าน",
    "บึงกาฬ",
    "บุรีรัมย์",
    "ปทุมธานี",
    "ประจวบคีรีขันธ์",
    "ปราจีนบุรี",
    "ปัตตานี",
    "พระนครศรีอยุธยา",
    "พะเยา",
    "พังงา",
    "พัทลุง",
    "พิจิตร",
    "พิษณุโลก",
    "เพชรบุรี",
    "เพชรบูรณ์",
    "แพร่",
    "ภูเก็ต",
    "มหาสารคาม",
    "มุกดาหาร",
    "แม่ฮ่องสอน",
    "ยโสธร",
    "ยะลา",
    "ร้อยเอ็ด",
    "ระนอง",
    "ระยอง",
    "ราชบุรี",
    "ลพบุรี",
    "ลำปาง",
    "ลำพูน",
    "เลย",
    "ศรีสะเกษ",
    "สกลนคร",
    "สงขลา",
    "สตูล",
    "สมุทรปราการ",
    "สมุทรสงคราม",
    "สมุทรสาคร",
    "สระแก้ว",
    "สระบุรี",
    "สิงห์บุรี",
    "สุโขทัย",
    "สุพรรณบุรี",
    "สุราษฎร์ธานี",
    "สุรินทร์",
    "หนองคาย",
    "หนองบัวลำภู",
    "อ่างทอง",
    "อำนาจเจริญ",
    "อุดรธานี",
    "อุตรดิตถ์",
    "อุทัยธานี",
    "อุบลราชธานี",
  ];

  // โหลดรถทั้งหมด + Catalog ยี่ห้อ/รุ่น ตอน modal เปิด
  useEffect(() => {
    const fetchData = async () => {
      try {
        if (!open) return;

        const [carsRes, modsRes] = await Promise.all([
          ListCars(),
          ListModals(),
        ]);

        if (Array.isArray(carsRes)) {
          setAllCars(carsRes);
        }

        if (modsRes && Array.isArray(modsRes)) {
          setModals(modsRes);
        }
      } catch {
        // ไม่บล็อก UI
      }
    };
    fetchData();
  }, [open]);

  // ตั้งค่าค่าจากรถที่กำลังแก้ไข
  useEffect(() => {
    if (car) {
      setBrand(car.Brand || "");
      setModel(car.ModelCar || "");
      setPlate(car.LicensePlate || "");
      setProvince(car.City || "");
      setIsSpecialReg(!!car.SpecialNumber);
      setPlateError(null);
    }
  }, [car]);

  // รวม brand จาก catalog + ของรถปัจจุบัน (เผื่อไม่อยู่ใน catalog)
  const brandOptions = useMemo(() => {
    const set = new Set<string>();
    if (car?.Brand) set.add(car.Brand);
    modals.forEach((m) => {
      const name = m.Brand?.BrandName?.trim();
      if (name) set.add(name);
    });
    return Array.from(set);
  }, [modals, car?.Brand]);

  // รวม model ตาม brand ที่เลือก + model เดิมของรถ (กันหาย)
  const modelOptions = useMemo(() => {
    const set = new Set<string>();
    if (!brand) {
      if (car?.ModelCar) set.add(car.ModelCar);
      return Array.from(set);
    }

    modals
      .filter((m) => m.Brand?.BrandName === brand)
      .forEach((m) => {
        if (m.ModalName) set.add(m.ModalName);
      });

    if (car?.ModelCar) set.add(car.ModelCar);

    return Array.from(set);
  }, [brand, modals, car?.ModelCar]);

  // รวม province จาก base + ของรถ (กันหาย)
  const provinces = useMemo(() => {
    const set = new Set<string>(baseProvinces);
    if (car?.City) set.add(car.City);
    return Array.from(set);
  }, [car?.City]);

  // ===== ตรวจรูปแบบและซ้ำของทะเบียน =====
  // รูปแบบที่อนุญาต: อักษรไทย/อังกฤษ 2 ตัว + ช่องว่าง "0 หรือ 1 ช่อง" + เลข 4 ตัว เช่น "กข 1234", "AB 1234"
  const plateRegex = /^[A-Za-zก-ฮ]{2}\s?\d{4}$/;

  const normalizePlate = (s: string) => s.replace(/\s+/g, "").toUpperCase();

  const validatePlate = (raw: string) => {
    const v = raw.trim();
    if (!v) {
      setPlateError(null);
      return;
    }
    if (!plateRegex.test(v)) {
      setPlateError("The registration form is invalid e.g. กข 1234 ");
      return;
    }
    const norm = normalizePlate(v);
    const isDup = allCars.some((c) => {
      if (car?.ID && c.ID === car.ID) return false; // ข้ามคันปัจจุบัน
      const other = normalizePlate(String(c?.LicensePlate ?? ""));
      return other === norm;
    });
    if (isDup) {
      setPlateError("Already registered");
    } else {
      setPlateError(null);
    }
  };

  // ตรวจทุกครั้งที่ plate เปลี่ยน
  useEffect(() => {
    validatePlate(plate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plate, allCars, car?.ID]);

  const canSubmit = Boolean(
    brand && model && plate && province && !plateError
  );

  const handleSubmit = async () => {
    if (!car?.ID || submitting || !canSubmit) return;

    // ตรวจซ้ำอีกครั้งกัน state lag
    validatePlate(plate);
    if (plateError) {
      messageApi.error("Please correct the license plate before saving");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        Brand: brand,
        ModelCar: model,
        LicensePlate: plate.trim(),
        City: province,
        SpecialNumber: isSpecialReg,
      };
      const res = await UpdateCarByID(car.ID, payload);
      if (res) {
        messageApi.success("Car updated successfully");
        onUpdated({ ...car, ...payload });
        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        messageApi.error("Unable to update data");
      }
    } catch (err) {
      console.error(err);
      messageApi.error("Car update error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {contextHolder}
      <Modal
        open={open}
        footer={null}
        onCancel={onClose}
        centered
        width={560}
        closable={false} // ใช้ปุ่ม X แบบ custom
        bodyStyle={{ padding: 0, background: "transparent" }}
        // @ts-ignore - ถ้าใช้ antd v4 สามารถแก้ผ่าน CSS แทนได้
        styles={{
          content: {
            background: "transparent",
            boxShadow: "none",
            padding: 0,
          },
        }}
        destroyOnClose
      >
        {/* การ์ดหลักแบบเดียวกับ BillModal (ปรับให้เข้ากับฟอร์มรถ) */}
        <div className="w-full max-w-xl mx-auto rounded-[26px] bg-white shadow-xl overflow-hidden">
          {/* HEADER GRADIENT */}
          <div className="bg-gradient-to-r from-blue-600 to-sky-500 px-5 sm:px-6 py-4 flex items-center justify-between text-white">
            <div className="flex items-center gap-3 min-w-0">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15">
                <FaBolt className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm sm:text-base font-semibold truncate">
                  Edit vehicle information
                </div>
                <div className="text-[11px] text-blue-100 truncate">
                  Update your EV details
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              aria-label="Close"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors"
            >
              <FaTimes className="h-4 w-4" />
            </button>
          </div>

          {/* BODY */}
          <div className="px-5 sm:px-6 pt-5 pb-5 bg-blue-50/40">
            <div className="text-[11px] font-semibold tracking-[0.18em] text-gray-500 mb-3">
              VEHICLE PROFILE
            </div>

            <div className="grid grid-cols-1 gap-4 max-h-[55vh] overflow-y-auto pr-1">
              {/* BRAND */}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-600 flex items-center gap-2">
                  <FaCarSide className="text-blue-500" /> Brand
                </span>
                <EVSelect
                  value={brand || undefined}
                  placeholder="Select brand"
                  options={brandOptions.map((b) => ({
                    label: b,
                    value: b,
                  }))}
                  disabled={brandOptions.length === 0}
                  onChange={(val) => {
                    setBrand(val || "");
                    setModel("");
                  }}
                />
              </label>

              {/* MODEL */}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-600 flex items-center gap-2">
                  <FaTags className="text-blue-500" /> Model
                </span>
                <EVSelect
                  value={model || undefined}
                  placeholder={
                    brand ? "Select model" : "Please select a brand first"
                  }
                  options={modelOptions.map((m) => ({
                    label: m,
                    value: m,
                  }))}
                  disabled={!brand || modelOptions.length === 0}
                  onChange={(val) => setModel(val || "")}
                />
              </label>

              {/* LICENSE PLATE */}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-600 flex items-center gap-2">
                  <FaTags className="text-blue-500" /> Vehicle registration
                </span>
                <Input
                  className={`mt-1 rounded-xl border p-2.5 outline-none ${
                    plateError
                      ? "border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-200"
                      : "border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  }`}
                  placeholder="For example, กข 1234"
                  value={plate}
                  onChange={(e) => setPlate(e.target.value)}
                />
                {plateError && (
                  <p className="text-xs text-red-500 mt-1">
                    {plateError}
                  </p>
                )}
              </label>

              {/* PROVINCE */}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-600 flex items-center gap-2">
                  <FaCity className="text-blue-500" /> Province
                </span>
                <EVSelect
                  value={province || undefined}
                  placeholder="Select a province"
                  options={provinces.map((p) => ({
                    label: p,
                    value: p,
                  }))}
                  disabled={provinces.length === 0}
                  onChange={(val) => setProvince(val || "")}
                />
              </label>

              {/* SPECIAL NUMBER */}
              <div className="flex items-center gap-2 mt-2">
                <Checkbox
                  checked={isSpecialReg}
                  onChange={(e) => setIsSpecialReg(e.target.checked)}
                />
                <span className="text-sm text-gray-700">
                  It is a special registration.
                </span>
              </div>
            </div>
          </div>

          {/* FOOTER */}
          <div className="px-5 sm:px-6 py-4 bg-white border-t border-blue-100 flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="px-4 h-10 rounded-xl border border-blue-200 bg-white text-blue-700 text-sm font-semibold hover:bg-blue-50 active:scale-[0.99] focus:outline-none focus:ring-4 focus:ring-blue-100 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className={`px-4 h-10 rounded-xl text-sm font-semibold shadow-sm transition focus:outline-none focus:ring-4 focus:ring-blue-200 active:scale-[0.99] ${
                canSubmit && !submitting
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "bg-blue-300 text-white"
              }`}
            >
              {submitting ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default EditCarModal;
