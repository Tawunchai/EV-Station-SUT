import React, { useEffect, useState } from "react";
import { FiPhone, FiMail } from "react-icons/fi";
import { ListServices } from "../../../../services";
import type { ServiceInterface } from "../../../../interface/IService";

const FooterFormal: React.FC = () => {
  const [service, setService] = useState<ServiceInterface | null>(null);
  const [loading, setLoading] = useState(true);

  // ✅ ดึงข้อมูล service จาก backend
  useEffect(() => {
    const fetchService = async () => {
      try {
        const res = await ListServices();
        if (res && res.length > 0) {
          setService(res[0]); // ใช้ service ตัวแรก
        }
      } catch (err) {
        console.error("Error fetching service:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchService();
  }, []);

  const phone = service?.Phone || "+66 44 223 000";
  const email = service?.Email || "info@sut.ac.th";
  const location =
    service?.Location ||
    "Suranaree University of Technology (SUT)\n111 University Ave, Muang, Nakhon Ratchasima 30000";

  return (
    <footer className="bg-white border-t border-gray-200 text-gray-700">
      <div className="max-w-screen-xl mx-auto px-6 py-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        {/* ซ้าย */}
        <div className="flex flex-col items-start space-y-2">
          {loading ? (
            <p className="text-sm text-gray-400 animate-pulse">
              Loading data...
            </p>
          ) : (
            <p className="text-sm text-gray-600 max-w-xs leading-relaxed whitespace-pre-line">
              {location}
            </p>
          )}
        </div>

        {/* ขวา */}
        {loading ? (
          <div className="flex flex-col items-start space-y-1 text-sm text-gray-400 animate-pulse">
            <div>Loading...</div>
          </div>
        ) : (
          <div className="flex flex-col items-start space-y-1 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <FiPhone className="text-blue-500" />
              <a
                href={`tel:${phone}`}
                className="hover:text-blue-600 transition"
              >
                {phone}
              </a>
            </div>
            <div className="flex items-center gap-2">
              <FiMail className="text-blue-500" />
              <a
                href={`mailto:${email}`}
                className="hover:text-blue-600 transition"
              >
                {email}
              </a>
            </div>
          </div>
        )}
      </div>

      {/* ลิขสิทธิ์ */}
      <div className="border-t border-gray-200">
        <div className="max-w-screen-xl mx-auto px-6 py-4 text-center text-xs text-gray-500">
          © {new Date().getFullYear()} Suranaree University of Technology (SUT)
        </div>
      </div>
    </footer>
  );
};

export default FooterFormal;
