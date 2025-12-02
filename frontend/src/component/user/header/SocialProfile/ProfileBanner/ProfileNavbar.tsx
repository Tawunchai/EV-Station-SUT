import React, { useState } from "react";
import { Tooltip, Button, Space } from "antd";
import { EditOutlined } from "@ant-design/icons";
import EditUserModal from "../edit/index";
import { UsersInterface } from "../../../../../interface/IUser";

interface ProfileNavbarProps {
  userData: UsersInterface;
  onProfileUpdated?: () => void;
}

export const ProfileNavbar: React.FC<ProfileNavbarProps> = ({
  userData,
  onProfileUpdated,
}) => {
  const [openModal, setOpenModal] = useState(false);

  console.log(userData)

  return (
    <>
      <div className="flex flex-col items-center md:flex-row md:justify-between">
        <Space>
          <Tooltip title="Edit user information" placement="bottom">
            <Button
              size="small"
              type="link"
              aria-label="Edit profile"
              onClick={() => setOpenModal(true)}
              className={`
                !text-white font-semibold tracking-wide
                rounded-lg px-3 py-1 transition
                hover:!text-white focus:!text-white active:!text-white
                hover:!bg-white/30 focus:!bg-white/35 active:!bg-white/40
                hover:!border hover:!border-white/60 focus:!border focus:!border-white/70
                hover:shadow-md focus:shadow-md
                focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60
                active:scale-[0.98]
              `}
              style={{ color: "#fff" }}
              icon={<EditOutlined />}
            >
              EDIT PROFILE
            </Button>
          </Tooltip>
        </Space>

        {/* ช่องว่างสำหรับเมนูอื่นในอนาคต */}
        <div className="hidden md:block" />
      </div>

      {/* Modal แก้ไขข้อมูล */}
      {userData && (
        <EditUserModal
          show={openModal}
          onClose={() => setOpenModal(false)}
          onSaveSuccess={() => {
            onProfileUpdated?.(); // รีเฟรชข้อมูลหลังอัปเดต
            setOpenModal(false);
          }}
          initialData={userData}
        />
      )}
    </>
  );
};
