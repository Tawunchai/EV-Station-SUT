import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AvatarWithInfo } from "./AvatarWithInfo";
import { ProfileNavbar } from "./ProfileNavbar";
import { GetUserByID } from "../../../../../services/httpLogin";
import {
  getCurrentUser,
  initUserProfile,
  Logout,
  clearCachedUser,
} from "../../../../../services/httpLogin";
import { UsersInterface } from "../../../../../interface/IUser";
import { Spin, message, Tooltip } from "antd";
import { LogOut } from "react-feather";
import EVCAR from "../../../../../assets/solar-profile.png";

const ProfileBanner: React.FC = () => {
  const navigate = useNavigate();

  const [userData, setUserData] = useState<UsersInterface | null>(null);
  const [loading, setLoading] = useState(true);
  const [logoutLoading, setLogoutLoading] = useState(false);

  const [messageApi, contextHolder] = message.useMessage();

  // 📦 ดึงข้อมูลผู้ใช้จาก cookie / memory / backend
  const fetchUser = async () => {
    try {
      setLoading(true);

      let current = getCurrentUser(); // ✅ ดึงจาก memory ก่อน
      if (!current) current = await initUserProfile(); // ✅ ถ้าไม่มี ให้ดึงจาก cookie (backend)

      const userID = current?.id;
      if (!userID) {
        console.warn("No user ID found in user data");
        setUserData(null);
        return;
      }

      const data = await GetUserByID(userID);
      if (data) setUserData(data);
      else setUserData(null);
    } catch (error) {
      console.error("❌ Error fetching user data:", error);
      setUserData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ===============================
      Logout
  =============================== */
  const handleLogout = async () => {
    if (logoutLoading) return;

    try {
      setLogoutLoading(true);

      const ok = await Logout();
      if (ok) {
        messageApi.success("Logged out");

        setTimeout(() => {
          clearCachedUser();
          localStorage.removeItem("role");
          window.dispatchEvent(new Event("roleChange"));
          navigate("/login", { replace: true });
        }, 600);
      } else {
        messageApi.error("Logout failed");
      }
    } catch (err) {
      console.error("❌ Error during logout:", err);
      messageApi.error("Error during logout");
    } finally {
      setLogoutLoading(false);
    }
  };

  // Loading state
  if (loading)
    return (
      <div className="flex justify-center items-center h-64">
        {contextHolder}
        <Spin size="large" tip="Loading Profile..." />
      </div>
    );

  // No data
  if (!userData)
    return (
      <div className="text-center text-gray-500 py-12">
        {contextHolder}
        User information not found
      </div>
    );

  return (
    <section className="mt-4 md:mt-6">
      {contextHolder}

      {/* Banner */}
      <div
        className="
          relative overflow-hidden rounded-2xl md:rounded-3xl
          bg-center bg-cover bg-no-repeat
          ev-hero
        "
        style={{ backgroundImage: `url(${EVCAR})` }}
      >
        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/35 to-black/25 md:from-black/55 md:via-black/30 md:to-black/20" />

        {/* ✅ Top actions (จัดระเบียบปุ่ม Logout ให้เล็ก + เนียนขึ้น) */}
        <div className="absolute right-3 top-3 md:right-5 md:top-5 z-20">
          <Tooltip title="Logout" placement="left">
            <button
              type="button"
              onClick={handleLogout}
              disabled={logoutLoading}
              className="
                group inline-flex items-center justify-center
                h-9 w-9 md:h-10 md:w-10
                rounded-full
                bg-white/85 backdrop-blur
                text-gray-800
                shadow-sm ring-1 ring-white/40
                hover:bg-white
                hover:shadow-md
                active:scale-[0.98]
                disabled:opacity-60 disabled:cursor-not-allowed
                transition
              "
              aria-label="Logout"
            >
              <LogOut
                size={18}
                className={logoutLoading ? "opacity-70" : "opacity-90"}
              />
            </button>
          </Tooltip>

          {/* ✅ tiny status text (optional) */}
          {logoutLoading && (
            <div className="mt-1 text-[11px] text-white/90 text-right">
              logging out...
            </div>
          )}
        </div>

        {/* Content */}
        <div className="relative z-10 px-4 md:px-8 py-8 md:py-10">
          {/* Avatar + Info */}
          <AvatarWithInfo inverted size={96} userData={userData} />

          {/* Navbar (แก้ไขข้อมูลส่วนตัว) */}
          <div className="mt-4 md:mt-6">
            <ProfileNavbar userData={userData} onProfileUpdated={fetchUser} />
          </div>
        </div>
      </div>
    </section>
  );
};

export { ProfileBanner };
