import React, { useEffect, useMemo, useRef, useState } from "react";
import { Table, Avatar, Tag, Space, Button, Input, Modal, message } from "antd";
import type { ColumnsType, TableProps } from "antd/es/table";
import {
  DeleteOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { Trash2 } from "react-feather";

import type { GendersInterface } from "../../../interface/IGender";
import type { UserroleInterface } from "../../../interface/IUserrole";
import {
  ListUsersByRoleUser,
  DeleteUser,
  UpdateUser,
  ListGenders,
  ListUserRoles,
  apiUrlPicture,
  ListUsers,
} from "../../../services";

import EditUserModal from "./edit/index";

// ------- Types -------
type RowType = {
  key: number;
  UserID: number;
  Username: string;
  FirstName: string;
  LastName: string;
  CustomerName: string;
  CustomerEmail: string;
  CustomerImage: string;
  Role: string;
  Status: string;
  StatusBg: string;
  PhoneNumber: string;
  Coin: number;
  Raw: any;
};

// ------- Custom Modal -------
const EvModal: React.FC<{
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ open, onClose, children }) => {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-[420px] mx-4 md:mx-auto">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden ring-1 ring-blue-100">
          {children}
          <div className="md:hidden h-[env(safe-area-inset-bottom)] bg-white" />
        </div>
      </div>
    </div>
  );
};

// ------- Component -------
const Customers: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [tableData, setTableData] = useState<RowType[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [searchText, setSearchText] = useState("");
  const [editUser, setEditUser] = useState<any>(null);
  const [genders, setGenders] = useState<GendersInterface[]>([]);
  const [userRoles, setUserRoles] = useState<UserroleInterface[]>([]);
  const [openConfirmModal, setOpenConfirmModal] = useState(false);
  const selectedUserRef = useRef<RowType | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [allUsersData, setAllUsersData] = useState<
    { Username: string; Email: string; PhoneNumber: string }[]
  >([]);

  // ✅ Responsive scrollX
  const [scrollX, setScrollX] = useState(950);

  useEffect(() => {
    const updateScrollX = () => {
      if (window.innerWidth <= 1300 && window.innerWidth >= 768) {
        // iPad
        setScrollX(830);
      } else {
        setScrollX(950);
      }
    };

    updateScrollX();
    window.addEventListener("resize", updateScrollX);
    return () => window.removeEventListener("resize", updateScrollX);
  }, []);

  // ------- Fetch all users (for duplicate check) -------
  const fetchAllUsers = async () => {
    try {
      const all = await ListUsers();
      if (Array.isArray(all)) {
        const mapped = all.map((u: any) => ({
          Username: u.Username ?? "",
          Email: u.Email ?? "",
          PhoneNumber: u.PhoneNumber ?? "",
        }));
        setAllUsersData(mapped);
      }
    } catch (err) {
      console.error("Error fetching all users:", err);
    }
  };

  // ------- Fetch customers -------
  const fetchUsers = async () => {
    setLoading(true);
    try {
      const users = await ListUsersByRoleUser();
      if (users) {
        const formatted: RowType[] = users.map((u: any) => ({
          key: u.ID,
          UserID: u.ID,
          Username: u.Username ?? "-",
          FirstName: u.FirstName ?? "",
          LastName: u.LastName ?? "",
          CustomerName: `${u.FirstName ?? ""} ${u.LastName ?? ""}`.trim(),
          CustomerEmail: u.Email ?? "-",
          CustomerImage:
            u?.Profile && u.Profile !== ""
              ? `${apiUrlPicture}${u.Profile}`
              : "https://via.placeholder.com/80x80.png?text=EV",
          Role: u.UserRole?.RoleName ?? "-",
          Status: u.Gender?.Gender ?? "-",
          StatusBg: u.Gender?.Gender === "Male" ? "#8BE78B" : "#FEC90F",
          PhoneNumber: u.PhoneNumber ?? "-",
          Coin: u.Coin ?? 0,
          Raw: u,
        }));
        setTableData(formatted);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchDropdowns = async () => {
    const [gs, rs] = await Promise.all([ListGenders(), ListUserRoles()]);
    if (gs) setGenders(gs);
    if (rs) setUserRoles(rs);
  };

  useEffect(() => {
    fetchUsers();
    fetchDropdowns();
    fetchAllUsers();
  }, []);

  // ------- Search -------
  const filteredData = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return tableData;
    return tableData.filter(
      (r) =>
        r.CustomerName.toLowerCase().includes(q) ||
        r.Username.toLowerCase().includes(q) ||
        r.CustomerEmail.toLowerCase().includes(q) ||
        r.Role.toLowerCase().includes(q) ||
        r.PhoneNumber.toLowerCase().includes(q)
    );
  }, [tableData, searchText]);

  // ------- Delete -------
  const openDeleteModal = (record: RowType) => {
    selectedUserRef.current = record;
    setOpenConfirmModal(true);
  };
  const cancelDelete = () => {
    setOpenConfirmModal(false);
    selectedUserRef.current = null;
    setConfirmLoading(false);
  };
  const confirmDelete = async () => {
    if (!selectedUserRef.current) return;
    setConfirmLoading(true);
    const ok = await DeleteUser(selectedUserRef.current.UserID);
    if (ok) {
      message.success("delete successful");
      await fetchUsers();
      await fetchAllUsers();
    } else {
      message.error("An error occurred while deleting");
    }
    cancelDelete();
  };

  // ------- Columns -------
  const columns: ColumnsType<RowType> = [
    {
      title: "User",
      dataIndex: "CustomerName",
      key: "user",
      sorter: (a, b) => a.CustomerName.localeCompare(b.CustomerName),
      render: (_, record) => (
        <Space size="middle">
          <Avatar src={record.CustomerImage} />
          <div className="min-w-0">
            <div className="font-semibold text-gray-900 truncate">
              {record.CustomerName || "-"}
            </div>
            <div className="text-gray-400 text-xs italic">
              {record.Username}
            </div>
            <div className="text-gray-500 text-xs truncate">
              {record.CustomerEmail}
            </div>
          </div>
        </Space>
      ),
    },
    {
      title: "Role",
      dataIndex: "Role",
      key: "role",
      width: 120,
      filters: [
        ...Array.from(new Set(tableData.map((t) => t.Role))).map((r) => ({
          text: r,
          value: r,
        })),
      ],
      onFilter: (val, rec) => rec.Role === val,
      render: (v) => (
        <Tag color="blue" className="px-2 py-1 rounded-md">
          {v}
        </Tag>
      ),
    },
    {
      title: "Gender",
      dataIndex: "Status",
      key: "gender",
      width: 120,
      filters: [
        ...Array.from(new Set(tableData.map((t) => t.Status))).map((s) => ({
          text: s,
          value: s,
        })),
      ],
      onFilter: (val, rec) => rec.Status === val,
      render: (v) => (
        <Tag
          color={v === "Male" ? "green" : "orange"}
          className="px-2 py-1 rounded-md"
        >
          {v}
        </Tag>
      ),
    },
    { title: "Phone", dataIndex: "PhoneNumber", key: "phone", width: 140 },
    {
      title: "Coin",
      dataIndex: "Coin",
      key: "coin",
      width: 90,
      sorter: (a, b) => a.Coin - b.Coin,
      render: (v) => (
        <span className="font-semibold text-blue-700">{v}</span>
      ),
    },
    {
      title: "Action",
      key: "action",
      width: 120,
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            className="border-blue-200 text-blue-700"
            onClick={() => setEditUser(record.Raw)}
          >
            Edit
          </Button>
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => openDeleteModal(record)}
          />
        </Space>
      ),
    },
  ];

  // ------- Selection -------
  const rowSelection: TableProps<RowType>["rowSelection"] = {
    selectedRowKeys,
    onChange: (keys) => setSelectedRowKeys(keys),
  };

  // ------- Bulk delete -------
  const handleBulkDelete = () => {
    if (selectedRowKeys.length === 0) return;
    Modal.confirm({
      title: "ยืนยันการลบ",
      icon: <ExclamationCircleOutlined />,
      content: `ลบ ${selectedRowKeys.length} รายการออกจากระบบหรือไม่?`,
      okText: "ลบ",
      cancelText: "ยกเลิก",
      okButtonProps: { danger: true },
      async onOk() {
        const results = await Promise.all(
          selectedRowKeys.map((id) => DeleteUser(Number(id)))
        );
        const failed = results.some((r) => !r);
        if (!failed) {
          message.success("ลบข้อมูลสำเร็จ");
          setSelectedRowKeys([]);
          fetchUsers();
          fetchAllUsers();
        } else {
          message.error("ลบบางรายการไม่สำเร็จ");
        }
      },
    });
  };

  // ------- Save from Edit Modal -------
  const handleUpdate = async (updated: any) => {
    const id = updated.UserID ?? updated.ID;
    if (!id) return message.error("ไม่พบรหัสผู้ใช้");

    const { Raw, CustomerName, ...payload } = updated;
    const ok = await UpdateUser(id, payload);
    if (ok) {
      message.success("Update successful");
      setEditUser(null);
      fetchUsers();
      fetchAllUsers();
    } else {
      message.error("Update failed");
    }
  };

  return (
    <div className="min-h-screen w-full bg-[linear-gradient(180deg,#eaf2ff_0%,#f6f9ff_60%,#ffffff_100%)] mt-14 sm:mt-0">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-blue-600 text-white shadow-sm">
        <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-sm sm:text-base font-semibold tracking-wide">
            Customers
          </h1>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-screen-xl px-4 sm:px-6 py-6">
        {/* Toolbar */}
        <div className="mb-4 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <Input
            allowClear
            size="large"
            prefix={<SearchOutlined />}
            placeholder="ค้นหา: ชื่อผู้ใช้ / อีเมล / เบอร์ / บทบาท"
            className="max-w-xl"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <Button
            danger
            icon={<DeleteOutlined />}
            disabled={selectedRowKeys.length === 0}
            onClick={handleBulkDelete}
            className="bg-white text-red-600 hover:bg-white/90 self-start sm:self-auto"
          >
            ลบที่เลือก ({selectedRowKeys.length})
          </Button>
        </div>

        {/* Table */}
        <div className="rounded-xl overflow-hidden ring-1 ring-blue-100 bg-white">
          <Table<RowType>
            rowSelection={rowSelection}
            columns={columns}
            dataSource={filteredData}
            loading={loading}
            scroll={{ x: scrollX }}
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              position: ["bottomCenter"],
            }}
            size="middle"
          />
        </div>
      </div>

      {/* Edit User Modal */}
      {editUser && (
        <EditUserModal
          open={!!editUser}
          onClose={() => setEditUser(null)}
          user={editUser}
          onSave={handleUpdate}
          genders={genders}
          userRoles={userRoles}
          allUsersData={allUsersData}
        />
      )}

      {/* Confirm Delete */}
      {/* Confirm Delete */}
      <EvModal open={openConfirmModal} onClose={cancelDelete}>
        <div className="w-[min(92vw,420px)] px-6 py-6 text-center">
          {/* Icon */}
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 border border-blue-100">
            <Trash2 size={22} className="text-blue-600" />
          </div>

          {/* Title */}
          <h3 className="text-base font-bold text-slate-900">
            ยืนยันการลบผู้ใช้
          </h3>

          {/* Main text */}
          <p className="mt-2 text-sm text-slate-600">
            คุณต้องการลบ{" "}
            {selectedUserRef.current?.CustomerName && (
              <span className="font-semibold text-blue-700">
                “{selectedUserRef.current.CustomerName}”
              </span>
            )}{" "}
            ใช่หรือไม่?
          </p>

          {/* Warning text */}
          <p className="mt-1 text-xs text-slate-500">
            การดำเนินการนี้ไม่สามารถย้อนกลับได้
          </p>

          {/* Buttons */}
          <div className="mt-5 flex items-center justify-center gap-2">
            <button
              onClick={confirmDelete}
              disabled={confirmLoading}
              className="min-w-[96px] h-10 rounded-xl bg-blue-600 text-white text-sm font-semibold shadow-sm hover:bg-blue-700"
            >
              {confirmLoading ? "กำลังลบ..." : "ลบ"}
            </button>
            <button
              onClick={cancelDelete}
              className="min-w-[96px] h-10 rounded-xl border border-blue-200 bg-white text-blue-700 text-sm font-semibold hover:bg-blue-50"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      </EvModal>
    </div>
  );
};

export default Customers;
