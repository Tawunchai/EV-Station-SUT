import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Checkbox, message, Spin } from "antd";
import { CreateCar, CarInterface, ListModals } from "../../../../services";
import type { ModalInterface } from "../../../../interface/ICarCatalog";
import { getCurrentUser, initUserProfile } from "../../../../services/httpLogin";

const EVHeader: React.FC<{ title?: string; onBack?: () => void }> = ({
  title = "Add vehicles",
  onBack,
}) => {
  const goBack = () => (onBack ? onBack() : window.history.back());
  return (
    <header className="sticky top-0 z-20 bg-gradient-to-r from-blue-600 to-sky-500 text-white rounded-b-2xl shadow-md overflow-hidden">
      <div className="w-full px-4 py-3 flex items-center gap-2 justify-start">
        <button
          type="button"
          onClick={goBack}
          aria-label="ย้อนกลับ"
          className="h-9 w-9 flex items-center justify-center rounded-xl active:bg-white/15 transition-colors"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-white">
            <path d="M13.5 2 4 13h6l-1.5 9L20 11h-6l1.5-9Z" fill="currentColor" />
          </svg>
          <span className="text-sm md:text-base font-semibold tracking-wide">{title}</span>
        </div>
      </div>
    </header>
  );
};

/* ---------------------------------------------------
   BOTTOM SHEET (MOBILE)
--------------------------------------------------- */
type SheetItem = { key: string; label: string };

const BottomSheet: React.FC<{
  open: boolean;
  title: string;
  items: SheetItem[];
  onClose: () => void;
  onSelect: (item: SheetItem) => void;
}> = ({ open, title, items, onClose, onSelect }) => {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((it) => it.label.toLowerCase().includes(s));
  }, [q, items]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white shadow-2xl border-t border-slate-200 transition-transform duration-300"
        style={{ paddingBottom: "env(safe-area-inset-bottom)", maxHeight: "85vh" }}
      >
        <div className="pt-2 pb-1">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-300" />
        </div>
        <div className="px-4 py-2 flex items-center justify-between">
          <button className="text-blue-600 font-medium" onClick={onClose}>
            cancel
          </button>
          <div className="text-slate-900 font-semibold">{title}</div>
          <div className="w-12" />
        </div>
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2">
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="search"
              className="w-full outline-none"
            />
          </div>
        </div>
        <div className="px-2 pb-2 overflow-y-auto" style={{ maxHeight: "65vh" }}>
          <ul className="divide-y divide-slate-100">
            {filtered.map((it) => (
              <li key={it.key}>
                <button className="w-full text-left px-4 py-3 active:bg-slate-50" onClick={() => onSelect(it)}>
                  {it.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

/* ---------------------------------------------------
   PROVINCES
--------------------------------------------------- */
const TH_PROVINCES = [
  "กระบี่","กรุงเทพมหานคร","กาญจนบุรี","กาฬสินธุ์","กำแพงเพชร","ขอนแก่น","จันทบุรี","ฉะเชิงเทรา",
  "ชลบุรี","ชัยนาท","ชัยภูมิ","ชุมพร","เชียงราย","เชียงใหม่","ตรัง","ตราด","ตาก","นครนายก","นครปฐม",
  "นครพนม","นครราชสีมา","นครศรีธรรมราช","นครสวรรค์","นนทบุรี","นราธิวาส","น่าน","บึงกาฬ","บุรีรัมย์",
  "ปทุมธานี","ประจวบคีรีขันธ์","ปราจีนบุรี","ปัตตานี","พระนครศรีอยุธยา","พะเยา","พังงา","พัทลุง",
  "พิจิตร","พิษณุโลก","เพชรบุรี","เพชรบูรณ์","แพร่","ภูเก็ต","มหาสารคาม","มุกดาหาร","แม่ฮ่องสอน",
  "ยโสธร","ยะลา","ร้อยเอ็ด","ระนอง","ระยอง","ราชบุรี","ลพบุรี","ลำปาง","ลำพูน","เลย","ศรีสะเกษ",
  "สกลนคร","สงขลา","สตูล","สมุทรปราการ","สมุทรสงคราม","สมุทรสาคร","สระแก้ว","สระบุรี","สิงห์บุรี",
  "สุโขทัย","สุพรรณบุรี","สุราษฎร์ธานี","สุรินทร์","หนองคาย","หนองบัวลำภู","อ่างทอง","อำนาจเจริญ",
  "อุดรธานี","อุตรดิตถ์","อุทัยธานี","อุบลราชธานี",
];

/* ---------------------------------------------------
   MAIN COMPONENT
--------------------------------------------------- */
const AddCarPage: React.FC = () => {
  const navigate = useNavigate();
  const [messageApi, contextHolder] = message.useMessage();

  const [userID, setUserID] = useState<number | undefined>(undefined);

  useEffect(() => {
    const loadUser = async () => {
      let current = getCurrentUser();
      if (!current) current = await initUserProfile();

      const uid = current?.id;
      if (!uid) {
        message.error("User information not found. Please log in again.");
        return;
      }
      setUserID(uid);
    };
    loadUser();
  }, []);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const [modals, setModals] = useState<ModalInterface[]>([]);
  const [loadingMods, setLoadingMods] = useState(true);

  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [otherBrand, setOtherBrand] = useState("");
  const [otherModel, setOtherModel] = useState("");

  const [isSpecialReg, setIsSpecialReg] = useState(false);

  // ✅ ทะเบียน: ห้ามว่าง แต่ "ไม่ validate รูปแบบ"
  const [plate, setPlate] = useState("");

  const [province, setProvince] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [brandSheetOpen, setBrandSheetOpen] = useState(false);
  const [modelSheetOpen, setModelSheetOpen] = useState(false);
  const [provinceSheetOpen, setProvinceSheetOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoadingMods(true);
      const data = await ListModals();
      if (data) setModals(data);
      setLoadingMods(false);
    };
    load();
  }, []);

  const brandOptions = useMemo(() => {
    const set = new Set<string>();
    modals.forEach((m) => {
      const name = m.Brand?.BrandName?.trim();
      if (name) set.add(name);
    });
    return [...set, "other"];
  }, [modals]);

  const modelOptions = useMemo(() => {
    if (!brand || brand === "other") return ["other"];
    const list = modals.filter((m) => m.Brand?.BrandName === brand).map((m) => m.ModalName);
    return [...new Set(list), "other"];
  }, [brand, modals]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!userID) {
      messageApi.error("User information not found");
      return;
    }

    // ✅ plate ห้ามว่าง (แต่ไม่เช็ครูปแบบ)
    if (!brand || !model || !province || !plate.trim()) {
      messageApi.warning("Please fill in all information.");
      return;
    }

    const finalBrand = brand === "other" ? otherBrand : brand;
    const finalModel = model === "other" ? otherModel : model;

    setSubmitting(true);
    try {
      const payload: CarInterface = {
        brand: finalBrand,
        model_car: finalModel,
        license_plate: plate.trim(),
        city: province,
        user_id: userID,
      };

      const res = await CreateCar(payload);
      if (res) {
        messageApi.success("Vehicle added successfully");
        setTimeout(() => navigate("/"), 1500);
      } else {
        messageApi.error("Recording failed");
      }
    } catch {
      messageApi.error("An error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="min-h-screen bg-gray-50 flex flex-col">
      {contextHolder}
      <EVHeader title="Add vehicle" onBack={() => navigate(-1)} />

      <div className="flex-1 px-4 pt-4 pb-28 overflow-y-auto">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* ===== ยี่ห้อ ===== */}
          <div>
            <span className="text-sm text-gray-700">brand *</span>
            {isMobile ? (
              <>
                <button
                  type="button"
                  onClick={() => setBrandSheetOpen(true)}
                  className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-left bg-white flex items-center justify-between"
                >
                  {loadingMods ? (
                    <div className="flex items-center gap-2 text-slate-500">
                      <Spin size="small" /> Loading...
                    </div>
                  ) : (
                    <>
                      <span className={brand ? "text-slate-900" : "text-slate-400"}>
                        {brand || "Select brand"}
                      </span>
                      <svg viewBox="0 0 24 24" className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </>
                  )}
                </button>

                {brand === "other" && (
                  <input
                    className="mt-3 w-full rounded-xl border border-slate-300 p-3 bg-white outline-none"
                    placeholder="Specify brand"
                    value={otherBrand}
                    onChange={(e) => setOtherBrand(e.target.value)}
                  />
                )}
              </>
            ) : (
              <div className="mt-2 flex flex-col gap-2">
                <select
                  className="rounded-xl border border-slate-300 p-3 bg-white outline-none"
                  value={brand}
                  onChange={(e) => {
                    setBrand(e.target.value);
                    setModel("");
                    setOtherBrand("");
                  }}
                >
                  <option value="">Select brand</option>
                  {brandOptions.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>

                {brand === "other" && (
                  <input
                    className="rounded-xl border border-slate-300 p-3 bg-white outline-none"
                    placeholder="Specify brand"
                    value={otherBrand}
                    onChange={(e) => setOtherBrand(e.target.value)}
                  />
                )}
              </div>
            )}
          </div>

          {/* ===== รุ่น ===== */}
          <div>
            <span className="text-sm text-gray-700">model *</span>
            {isMobile ? (
              <>
                <button
                  type="button"
                  onClick={() => setModelSheetOpen(true)}
                  disabled={!brand}
                  className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-left bg-white flex items-center justify-between"
                >
                  <span className={model ? "text-slate-900" : "text-slate-400"}>
                    {model || "model"}
                  </span>
                  <svg viewBox="0 0 24 24" className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>

                {(brand === "other" || model === "other") && (
                  <input
                    className="mt-3 w-full rounded-xl border border-slate-300 p-3 bg-white outline-none"
                    placeholder="Specify model"
                    value={otherModel}
                    onChange={(e) => setOtherModel(e.target.value)}
                  />
                )}
              </>
            ) : (
              <div className="mt-2 flex flex-col gap-2">
                <select
                  className="rounded-xl border border-slate-300 p-3 bg-white outline-none"
                  disabled={!brand}
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                >
                  <option value="">Select model</option>
                  {modelOptions.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>

                {(brand === "other" || model === "other") && (
                  <input
                    className="rounded-xl border border-slate-300 p-3 bg-white outline-none"
                    placeholder="Specify model"
                    value={otherModel}
                    onChange={(e) => setOtherModel(e.target.value)}
                  />
                )}
              </div>
            )}
          </div>

          {/* ===== ทะเบียนพิเศษ ===== */}
          <div className="flex items-center gap-2">
            <Checkbox checked={isSpecialReg} onChange={(e) => setIsSpecialReg(e.target.checked)} />
            <span>Your vehicle has a special registration.</span>
          </div>

          {/* ===== ทะเบียน (ห้ามว่าง แต่ใส่อะไรก็ได้) ===== */}
          <div>
            <span className="text-sm text-gray-700">register *</span>
            <input
              className="mt-2 w-full rounded-xl border border-slate-300 p-3 bg-white outline-none"
              placeholder=""
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
            />
          </div>

          {/* ===== จังหวัด ===== */}
          <div>
            <span className="text-sm text-gray-700">province *</span>
            {isMobile ? (
              <button
                type="button"
                onClick={() => setProvinceSheetOpen(true)}
                className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-left bg-white flex items-center justify-between"
              >
                <span className={province ? "text-slate-900" : "text-slate-400"}>
                  {province || "Select a province"}
                </span>
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            ) : (
              <select
                className="mt-2 w-full rounded-xl border border-slate-300 p-3 bg-white outline-none"
                value={province}
                onChange={(e) => setProvince(e.target.value)}
              >
                <option value="">Select a province</option>
                {TH_PROVINCES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* ปุ่มบันทึก */}
      <div className="fixed bottom-0 left-0 right-0 px-4 pb-6 bg-white">
        <button
          type="submit"
          disabled={submitting}
          className={`w-full h-14 rounded-2xl font-semibold text-white shadow-lg ${
            !submitting ? "bg-blue-600 hover:bg-blue-700" : "bg-blue-300"
          }`}
        >
          {submitting ? "Recording..." : "Save"}
        </button>
      </div>

      {/* BottomSheet (Mobile only) */}
      <BottomSheet
        open={isMobile && brandSheetOpen}
        title="brand"
        items={brandOptions.map((b) => ({ key: b, label: b }))}
        onClose={() => setBrandSheetOpen(false)}
        onSelect={(it) => {
          setBrand(it.key);
          setBrandSheetOpen(false);
        }}
      />
      <BottomSheet
        open={isMobile && modelSheetOpen}
        title="model"
        items={modelOptions.map((m) => ({ key: m, label: m }))}
        onClose={() => setModelSheetOpen(false)}
        onSelect={(it) => {
          setModel(it.key);
          setModelSheetOpen(false);
        }}
      />
      <BottomSheet
        open={isMobile && provinceSheetOpen}
        title="province"
        items={TH_PROVINCES.map((p) => ({ key: p, label: p }))}
        onClose={() => setProvinceSheetOpen(false)}
        onSelect={(it) => {
          setProvince(it.key);
          setProvinceSheetOpen(false);
        }}
      />
    </form>
  );
};

export default AddCarPage;
