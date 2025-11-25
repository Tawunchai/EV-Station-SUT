import React, { useEffect, useState } from "react";
import { Spin, Tag, message, Tooltip } from "antd";
import { FiMapPin, FiLink } from "react-icons/fi";
import { useNavigate } from "react-router-dom";

import { ListCabinetsEV, apiUrlPicture } from "../../../../services";

type CabinetType = {
  ID: number;
  Name: string;
  Location: string;
  Status: string;
  Image: string;
  Description?: string;
  Latitude?: number;
  Longitude?: number;
  EmployeeID?: number | null;
  UrlWebsocket?: string | null;
  ChargePoint?: string | null;
};

const BeforeEV: React.FC = () => {
  const [cabinets, setCabinets] = useState<CabinetType[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const navigate = useNavigate();

  const fetchCabinets = async () => {
    setLoading(true);
    try {
      const res = await ListCabinetsEV();
      console.log("🟦 ListCabinetsEV =>", res);
      if (res && Array.isArray(res)) {
        setCabinets(res);
      } else {
        setCabinets([]);
        message.warning("ไม่พบข้อมูลตู้ชาร์จ EV");
      }
    } catch (error) {
      console.error("Error load cabinets:", error);
      message.error("ไม่สามารถโหลดข้อมูลตู้ชาร์จได้");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCabinets();
  }, []);

  const getStatusColor = (status: string) => {
    const s = status?.toLowerCase();
    if (s.includes("active") || s.includes("พร้อมใช้งาน")) return "success";
    if (s.includes("inactive") || s.includes("ปิดปรับปรุง")) return "error";
    return "default";
  };

  // ✅ ฟังก์ชันประกอบ URL รูปให้ถูก
  const buildImageUrl = (imagePath?: string | null): string => {
    if (!imagePath) {
      return "https://images.pexels.com/photos/9800009/pexels-photo-9800009.jpeg?auto=compress&cs=tinysrgb&w=800";
    }

    // ถ้าเป็น URL เต็มแล้ว ก็ใช้ได้เลย
    if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
      return imagePath;
    }

    // ลบ / เกิน ๆ ออกทั้ง base และ path
    const base = apiUrlPicture.replace(/\/+$/, ""); // ตัด / ท้าย
    const path = imagePath.replace(/^\/+/, ""); // ตัด / หน้า

    const fullUrl = `${base}/${path}`;
    console.log("🖼 FULL IMAGE URL =>", fullUrl);
    return fullUrl;
  };

  // ✅ เวลา click การ์ด → ไปหน้า monitor
  const handleSelectCabinet = (cabinet: CabinetType) => {
    navigate("/admin/after-cabinet", {
      state: {
        cabinet,
      },
    });
  };

  return (
    <div className="min-h-screen w-full bg-white mt-14 sm:mt-0">
      {/* Header แบบแถบเล็กสไตล์ Customers */}
      {/* Header แบบแถบเล็กสไตล์ Customers (ขยายให้กว้างขึ้น) */}
      <div className="sticky top-0 z-10 bg-blue-600 text-white shadow-sm">
        <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center">
          <h1 className="text-sm sm:text-base font-semibold tracking-wide">
            Monitor Cabinet EV
          </h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Spin size="large" />
          </div>
        ) : cabinets.length === 0 ? (
          <div className="mt-12 text-center text-slate-500">
            ยังไม่มีข้อมูลตู้ชาร์จให้แสดง
          </div>
        ) : (
          <div
            className="
              grid
              grid-cols-1
              gap-4
              sm:grid-cols-2
              lg:grid-cols-3
            "
          >
            {cabinets.map((cabinet) => {
              const {
                ID,
                Name,
                Description,
                Location,
                Status,
                UrlWebsocket,
                ChargePoint,
                Image,
              } = cabinet;

              const imageUrl = buildImageUrl(Image);

              return (
                <article
                  key={ID}
                  onClick={() => handleSelectCabinet(cabinet)}
                  className="
                    flex
                    flex-col
                    cursor-pointer
                    overflow-hidden
                    rounded-2xl
                    border
                    border-slate-100
                    bg-white
                    shadow-sm
                  "
                >
                  {/* แถบบนบาง ๆ */}
                  <div className="h-1 w-full bg-blue-500" />

                  {/* รูปภาพ */}
                  <div className="relative h-40 w-full overflow-hidden bg-slate-100 sm:h-44">
                    <img
                      src={imageUrl}
                      alt={Name}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        console.warn("❌ โหลดรูปไม่สำเร็จ:", imageUrl);
                        (e.currentTarget as HTMLImageElement).src =
                          "https://images.pexels.com/photos/9800009/pexels-photo-9800009.jpeg?auto=compress&cs=tinysrgb&w=800";
                      }}
                    />

                    {/* Status */}
                    {Status && (
                      <div className="absolute right-2 top-2">
                        <Tag color={getStatusColor(Status)}>{Status}</Tag>
                      </div>
                    )}
                  </div>

                  {/* เนื้อการ์ด */}
                  <div className="flex flex-1 flex-col p-4">
                    {/* ชื่อ + ChargePoint */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className="truncate text-sm font-semibold text-blue-700 sm:text-base ">
                          {Name || `EV Cabinet #${ID}`}
                        </h2>
                        {ChargePoint && (
                          <p className="mt-0.5 text-xs text-slate-500">
                            ChargePoint{" "}
                            <span className="font-medium text-slate-800">
                              {ChargePoint}
                            </span>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Description */}
                    {Description && (
                      <p className="mt-2 line-clamp-2 text-xs text-slate-600 sm:text-sm">
                        {Description}
                      </p>
                    )}

                    {/* Location */}
                    {Location && (
                      <div className="mt-3 flex items-center gap-1 text-xs text-slate-500 sm:text-sm">
                        <FiMapPin className="shrink-0 text-blue-500" />
                        <span className="line-clamp-1">{Location}</span>
                      </div>
                    )}

                    {/* UrlWebsocket */}
                    {UrlWebsocket && (
                      <div className="mt-2 flex items-center gap-1 text-[11px] text-slate-500 sm:text-xs">
                        <FiLink className="shrink-0 text-emerald-500" />
                        <Tooltip title={UrlWebsocket}>
                          <span className="max-w-[220px] truncate sm:max-w-[240px] lg:max-w-[260px]">
                            {UrlWebsocket}
                          </span>
                        </Tooltip>
                      </div>
                    )}

                    {/* แถบด้านล่างข้อความเล็ก ๆ */}
                    <div className="mt-4 flex items-center justify-between text-[11px] text-slate-400">
                      <span>คลิกการ์ดเพื่อเข้าไป Monitor</span>
                      <span className="text-blue-500">&raquo;</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default BeforeEV;
