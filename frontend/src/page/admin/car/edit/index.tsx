import React, { useEffect, useMemo, useState, useRef } from "react";
import { Checkbox, Input, message, Modal } from "antd";
import { FaCarSide, FaCity, FaTags, FaBolt } from "react-icons/fa";
import { X } from "react-feather";
import { UpdateCarByID, ListCars, ListModals } from "../../../../services";
import type { CarsInterface } from "../../../../interface/ICar";
import type { ModalInterface } from "../../../../interface/ICarCatalog";

interface ModalEditCarProps {
  open: boolean;
  onClose: () => void;
  car?: CarsInterface | null;
  onUpdated: (updated: CarsInterface) => void;
}

// type guard
function isCarsArray(arr: unknown): arr is CarsInterface[] {
  return Array.isArray(arr);
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

  const selectedLabel = options.find((o) => o.value === value)?.label ?? "";

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
        <span className={value ? "text-slate-900" : "text-slate-400 select-none"}>
          {value ? selectedLabel : placeholder || "เลือก"}
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
            <div className="px-3 py-2 text-sm text-slate-400">ไม่มีตัวเลือก</div>
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

          {value && (
            <button
              type="button"
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
              className="w-full px-3 py-2 text-left text-xs text-red-500 border-t border-slate-100 hover:bg-red-50"
            >
              ล้างค่า
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

const ModalEditCar: React.FC<ModalEditCarProps> = ({
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
  const [plateError, setPlateError] = useState<string | null>(null);
  const [allCars, setAllCars] = useState<CarsInterface[]>([]);

  // Catalog Brand/Model จาก ListModals
  const [modals, setModals] = useState<ModalInterface[]>([]);

  // จังหวัดทั้งหมด (base)
  const baseProvinces = [
    "กระบี่","กรุงเทพมหานคร","กาญจนบุรี","กาฬสินธุ์","กำแพงเพชร","ขอนแก่น","จันทบุรี","ฉะเชิงเทรา","ชลบุรี",
    "ชัยนาท","ชัยภูมิ","ชุมพร","เชียงราย","เชียงใหม่","ตรัง","ตราด","ตาก","นครนายก","นครปฐม","นครพนม",
    "นครราชสีมา","นครศรีธรรมราช","นครสวรรค์","นนทบุรี","นราธิวาส","น่าน","บึงกาฬ","บุรีรัมย์","ปทุมธานี",
    "ประจวบคีรีขันธ์","ปราจีนบุรี","ปัตตานี","พระนครศรีอยุธยา","พะเยา","พังงา","พัทลุง","พิจิตร","พิษณุโลก",
    "เพชรบุรี","เพชรบูรณ์","แพร่","ภูเก็ต","มหาสารคาม","มุกดาหาร","แม่ฮ่องสอน","ยโสธร","ยะลา","ร้อยเอ็ด",
    "ระนอง","ระยอง","ราชบุรี","ลพบุรี","ลำปาง","ลำพูน","เลย","ศรีสะเกษ","สกลนคร","สงขลา","สตูล","สมุทรปราการ",
    "สมุทรสงคราม","สมุทรสาคร","สระแก้ว","สระบุรี","สิงห์บุรี","สุโขทัย","สุพรรณบุรี","สุราษฎร์ธานี","สุรินทร์",
    "หนองคาย","หนองบัวลำภู","อ่างทอง","อำนาจเจริญ","อุดรธานี","อุตรดิตถ์","อุทัยธานี","อุบลราชธานี",
  ];

  // ✅ ชื่อเจ้าของ (หลายคนคั่นด้วย , )
  const ownerNames = useMemo(() => {
    const users = (car as any)?.User ?? [];
    if (!Array.isArray(users) || users.length === 0) return "-";
    return users
      .map((u) => `${u?.FirstName ?? ""} ${u?.LastName ?? ""}`.trim())
      .filter(Boolean)
      .join(", ");
  }, [car]);

  // โหลดรถทั้งหมด + catalog จาก ListModals เมื่อ modal เปิด
  useEffect(() => {
    const fetchData = async () => {
      if (!open) return;
      try {
        const [resCars, resModals] = await Promise.all([ListCars(), ListModals()]);

        if (isCarsArray(resCars)) setAllCars(resCars);
        else setAllCars([]);

        if (resModals && Array.isArray(resModals)) setModals(resModals);
        else setModals([]);
      } catch {
        setAllCars([]);
        setModals([]);
      }
    };
    fetchData();
  }, [open]);

  // ตั้งค่าจากรถที่กำลังแก้ไข
  useEffect(() => {
    if (car) {
      setBrand((car as any).Brand ?? "");
      setModel((car as any).ModelCar ?? "");
      setPlate((car as any).LicensePlate ?? "");
      setProvince((car as any).City ?? "");
      setIsSpecialReg(!!(car as any).SpecialNumber);
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

  // รวม model ตาม brand + model เดิมของรถ
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

  // ===== ตรวจ "ซ้ำอย่างเดียว" + ห้ามว่าง (ไม่ตรวจรูปแบบ) =====
  const normalizePlate = (s: string) => s.replace(/\s+/g, "").toUpperCase();

  const validatePlate = (raw: string) => {
    const v = raw.trim();

    // ห้ามว่าง
    if (!v) {
      setPlateError("กรุณากรอกทะเบียนรถ");
      return;
    }

    // ตรวจซ้ำ (ข้ามคันปัจจุบัน)
    const norm = normalizePlate(v);
    const isDup = allCars.some((c) => {
      if (car?.ID !== undefined && c.ID === car.ID) return false;
      const other = normalizePlate(String((c as any).LicensePlate ?? ""));
      return other === norm;
    });

    setPlateError(isDup ? "ทะเบียนนี้มีอยู่ในระบบแล้ว" : null);
  };

  useEffect(() => {
    if (!open) return;
    validatePlate(plate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plate, allCars, car?.ID, open]);

  const canSubmit =
    Boolean(brand && model && plate.trim() && province && !plateError) &&
    car?.ID !== undefined;

  const handleSubmit = async () => {
    if (!car || car.ID === undefined || submitting) return;

    const v = plate.trim();
    if (!brand || !model || !province || !v) {
      message.warning("กรุณากรอกข้อมูลให้ครบ");
      if (!v) setPlateError("กรุณากรอกทะเบียนรถ");
      return;
    }

    // กัน state lag: เช็คซ้ำอีกรอบก่อนส่ง
    const norm = normalizePlate(v);
    const isDup = allCars.some((c) => {
      if (car?.ID !== undefined && c.ID === car.ID) return false;
      const other = normalizePlate(String((c as any).LicensePlate ?? ""));
      return other === norm;
    });

    if (isDup) {
      setPlateError("ทะเบียนนี้มีอยู่ในระบบแล้ว");
      message.error("ทะเบียนซ้ำ กรุณาเปลี่ยนทะเบียน");
      return;
    }

    setPlateError(null);

    setSubmitting(true);
    try {
      const payload = {
        Brand: brand,
        ModelCar: model,
        LicensePlate: v,
        City: province,
        SpecialNumber: isSpecialReg,
      };
      const ok = await UpdateCarByID(car.ID, payload);

      if (ok) {
        await message.open({
          type: "success",
          content: "Vehicle updated successfully",
          duration: 1.2,
        });

        onUpdated({ ...car, ...payload });
        onClose();
      } else {
        message.error("An error occurred while updating");
      }
    } catch (err) {
      console.error(err);
      message.error("เกิดข้อผิดพลาดในการอัปเดตรถ");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      centered
      destroyOnClose
      closable={false}
      width={520}
      className="ev-scope max-w-full md:max-w-[520px]"
      bodyStyle={{ padding: 0, background: "transparent" }}
      styles={{
        content: {
          background: "transparent",
          boxShadow: "none",
          padding: 0,
        },
      }}
    >
      <div className="w-full max-w-[520px] mx-auto rounded-[24px] bg-white shadow-xl ring-1 ring-blue-100 overflow-hidden flex flex-col max-h-[85vh] mt-12 md:mt-0">
        {/* HEADER */}
        <div className="relative bg-gradient-to-r from-blue-600 to-sky-500 px-5 pt-3 pb-4 md:pt-4 md:pb-4 text-white">
          {/* drag bar mobile */}
          <div className="mx-auto w-10 h-1.5 md:hidden rounded-full bg-white/60 mb-3" />
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-white/15">
                <FaCarSide className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base md:text-lg font-semibold">แก้ไขข้อมูลพาหนะ</h2>
                <p className="text-[11px] text-blue-100">
                  ปรับปรุงยี่ห้อ รุ่น ทะเบียน และจังหวัดของรถคันนี้
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              aria-label="ปิดหน้าต่าง"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15 hover:bg-white/25 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* BODY */}
        <div className="px-5 md:px-6 py-5 bg-slate-50/70 overflow-y-auto flex-1">
          <div className="mb-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200">
              <FaBolt className="text-amber-400" />
              ข้อมูลรถของคุณ
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {/* BRAND */}
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-600 flex items-center gap-2">
                <FaCarSide className="text-blue-500" /> ยี่ห้อรถ
              </span>
              <EVSelect
                value={brand || undefined}
                placeholder="เลือกยี่ห้อ"
                options={brandOptions.map((b) => ({ label: b, value: b }))}
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
                <FaTags className="text-blue-500" /> รุ่นรถ
              </span>
              <EVSelect
                value={model || undefined}
                placeholder={brand ? "เลือกรุ่น" : "กรุณาเลือกยี่ห้อก่อน"}
                options={modelOptions.map((m) => ({ label: m, value: m }))}
                disabled={!brand || modelOptions.length === 0}
                onChange={(val) => setModel(val || "")}
              />
            </label>

            {/* LICENSE PLATE */}
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-600 flex items-center gap-2">
                <FaTags className="text-blue-500" /> ทะเบียนรถ
              </span>
              <Input
                className={`mt-1 rounded-xl border p-2.5 text-sm outline-none ${
                  plateError
                    ? "border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-200"
                    : "border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                }`}
                placeholder="ใส่ทะเบียนอะไรก็ได้ (ห้ามเว้นว่าง) — ระบบตรวจซ้ำ"
                value={plate}
                onChange={(e) => setPlate(e.target.value)}
              />
              {plateError && <p className="text-xs text-red-500 mt-1">{plateError}</p>}
            </label>

            {/* PROVINCE */}
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-600 flex items-center gap-2">
                <FaCity className="text-blue-500" /> จังหวัด
              </span>
              <EVSelect
                value={province || undefined}
                placeholder="เลือกจังหวัด"
                options={provinces.map((p) => ({ label: p, value: p }))}
                disabled={provinces.length === 0}
                onChange={(val) => setProvince(val || "")}
              />
            </label>

            {/* SPECIAL NUMBER */}
            <div className="flex items-center gap-2 mt-2 rounded-xl bg-white px-3 py-2 border border-slate-200">
              <Checkbox checked={isSpecialReg} onChange={(e) => setIsSpecialReg(e.target.checked)} />
              <span className="text-sm text-gray-700">ทะเบียนพิเศษ (Special Number)</span>
            </div>

            {/* OWNER */}
            <div className="pt-1">
              <p className="text-[11px] text-slate-500 text-center">
                เจ้าของ:{" "}
                <span className="font-medium text-slate-700">{ownerNames}</span>
              </p>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="px-5 md:px-6 py-4 bg-white border-t border-slate-200 flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 h-10 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 transition active:scale-[0.99]"
          >
            ยกเลิก
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className={`px-4 h-10 rounded-xl text-sm font-semibold text-white shadow-sm transition active:scale-[0.99] ${
              canSubmit && !submitting ? "bg-blue-600 hover:bg-blue-700" : "bg-blue-300 cursor-not-allowed"
            }`}
          >
            {submitting ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>

        {/* Safe Area (iOS) */}
        <div className="md:hidden h-[env(safe-area-inset-bottom)] bg-white" />
      </div>
    </Modal>
  );
};

export default ModalEditCar;
