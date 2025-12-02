import React, { useEffect, useState } from "react";
import { AvatarWithInfo } from "./AvatarWithInfo";
import { ProfileNavbar } from "./ProfileNavbar";
import { GetUserByID } from "../../../../../services/httpLogin";
import { getCurrentUser, initUserProfile } from "../../../../../services/httpLogin"; // ✅ เพิ่มมา
import { UsersInterface } from "../../../../../interface/IUser";
import { Spin } from "antd";
import EVCAR from "../../../../../assets/solar-profile.png";

const ProfileBanner: React.FC = () => {
  const [userData, setUserData] = useState<UsersInterface | null>(null);
  const [loading, setLoading] = useState(true);

  // 📦 ดึงข้อมูลผู้ใช้จาก cookie / memory / backend
  const fetchUser = async () => {
    try {
      let current = getCurrentUser(); // ✅ ดึงจาก memory ก่อน
      if (!current) current = await initUserProfile(); // ✅ ถ้าไม่มี ให้ดึงจาก cookie (backend)

      const userID = current?.id;
      if (!userID) {
        console.warn("No user ID found in user data");
        return;
      }

      const data = await GetUserByID(userID);
      if (data) setUserData(data);
    } catch (error) {
      console.error("❌ Error fetching user data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  // Loading state
  if (loading)
    return (
      <div className="flex justify-center items-center h-64">
        <Spin size="large" tip="Loading Profile..." />
      </div>
    );

  // No data
  if (!userData)
    return (
      <div className="text-center text-gray-500 py-12">
        User information not found
      </div>
    );

  return (
    <section className="mt-4 md:mt-6">
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
