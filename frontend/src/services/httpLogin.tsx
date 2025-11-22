import axios from "axios";
import { LoginInterface } from "../interface/Login"
import { EmployeeInterface } from "../interface/IEmployee";
import { UsersInterface } from "../interface/IUser";

const apiUrl = "https://payment-project-t4dj.onrender.com";
//const apiUrl = "http://10.0.14.228:8000";
//const apiUrl = "http://10.167.17.128:8000";
//const apiUrl = "http://192.168.1.141:8000";
//const apiUrl = "http://localhost:8000";

axios.defaults.withCredentials = true; // ✅ ให้ cookie แนบอัตโนมัติ

function getAuthHeaders() {
  const token = localStorage.getItem("token");
  const tokenType = localStorage.getItem("token_type");
  return {
    "Authorization": `${tokenType} ${token}`,
    "Content-Type": "application/json",
  };
}

/*const requestOptions = {
  headers: getAuthHeaders(),
};*/

const getHeaders = (): Record<string, string> => {
  const Authorization = localStorage.getItem("token");
  const Bearer = localStorage.getItem("token_type");
  return {
    "Content-Type": "application/json",
    Authorization: `${Bearer} ${Authorization}`,
  };
};

// สำหรับเช็ค email มีในระบบหรือไม่ (response แค่สถานะ)
export interface CheckEmailResponse {
  exists: boolean;
  message: string;
}

// request สำหรับ reset password
export interface ResetPasswordRequest {
  email: string;
  new_password: string;
}

// response reset password
export interface ResetPasswordResponse {
  message: string;
}

// ฟังก์ชันเช็ค email
export const checkEmailExists = async (
  email: string
): Promise<CheckEmailResponse | null> => {
  try {
    const response = await axios.post<CheckEmailResponse>(
      `${apiUrl}/check-email`,
      { email },
      { headers: { "Content-Type": "application/json" } }
    );

    if (response.status === 200) {
      return response.data;
    }
    return null;
  } catch (error: any) {
    console.error("Error checking email:", error.response?.data || error.message);
    return null;
  }
};

// ฟังก์ชัน reset password
export const resetPassword = async (
  data: ResetPasswordRequest
): Promise<ResetPasswordResponse | null> => {
  try {
    const response = await axios.post<ResetPasswordResponse>(
      `${apiUrl}/reset-password`,
      data,
      { headers: { "Content-Type": "application/json" } }
    );

    if (response.status === 200) {
      return response.data;
    }
    return null;
  } catch (error: any) {
    console.error("Error resetting password:", error.response?.data || error.message);
    return null;
  }
};


export async function AddLogin(data: LoginInterface) {
  return await axios.post(`${apiUrl}/login`, data);
}

export async function GetProfile() {
  return await axios.get(`${apiUrl}/me`);
}

// -------------------- ✅ ฟังก์ชัน Logout --------------------
export async function Logout() {
  try {
    const res = await axios.post(`${apiUrl}/logout`, {}, { withCredentials: true });
    if (res.status === 200) {
      localStorage.clear(); // เคลียร์ข้อมูลที่ frontend เก็บไว้
      sessionStorage.clear();
      return true;
    }
    return false;
  } catch (err) {
    console.error("❌ Logout error:", err);
    return false;
  }
}

export interface CurrentUser {
  id: number;
  username: string;
  firstname: string;
  lastname: string;
  role: string;
  email: string;
  profile?: string;
  employee_id?: number | null; // ✅ เพิ่มฟิลด์นี้เท่านั้น
}

// เก็บข้อมูลผู้ใช้ปัจจุบันไว้ในตัวแปรเดียว
let currentUser: CurrentUser | null = null;

// ✅ ฟังก์ชันเรียกข้อมูล user ครั้งเดียว แล้ว cache ไว้
export async function initUserProfile(): Promise<CurrentUser | null> {
  try {
    const res = await GetProfile();
    currentUser = res.data;
    return currentUser;
  } catch (err) {
    console.error("❌ Failed to init user profile:", err);
    currentUser = null;
    return null;
  }
}

export function getCurrentUser(): CurrentUser | null {
  return currentUser;
}

export function clearCachedUser() {
  currentUser = null;
}
// ✅ ฟังก์ชันเอาไว้เรียกใช้งาน (โดยไม่ต้อง fetch ใหม่)

export const GetEmployeeByUserID = async (
  id: number | string
): Promise<EmployeeInterface | false> => {
  try {
    const response = await axios.get(`${apiUrl}/employee/${id}`, {
      headers: getHeaders(),
    });

    console.log("Response from API:", response.data); 
    return response.data.employeeID; 
  } catch (error: any) {
    console.error(
      "Error fetching EmployeeID:",
      error.response?.data || error.message
    );
    return false; 
  }
};

export const CreateUser = async (
  formData: FormData
): Promise<any | false> => {
  try {
    const response = await axios.post(`${apiUrl}/signup`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
        Authorization: `${localStorage.getItem(
          "token_type"
        )} ${localStorage.getItem("token")}`,
      },
    });

    if (response.status !== 201) {
      throw new Error("Error creating user");
    }

    return response.data;
  } catch (error) {
    console.error("Error creating user:", error);
    return false;
  }
};

async function GetGender() {
  try {
    const response = await axios.get(`${apiUrl}/genders`, {
      headers: getAuthHeaders(),
    });
    return response.data; // สมมติว่า API ส่งข้อมูล genders กลับมาใน response.data
  } catch (error) {
    console.error("Error fetching genders:", error);
    return [];
  }
}

export const GetUserByID = async (
  id: number | string
): Promise<UsersInterface | false> => {
  try {
    const response = await axios.get(`${apiUrl}/users/${id}`, {
      headers: getHeaders(),
    });

    console.log("✅ Response from GetUserByID:", response.data);
    return response.data as UsersInterface;
  } catch (error: any) {
    console.error(
      "❌ Error fetching user by ID:",
      error.response?.data || error.message
    );
    return false;
  }
};

export const SendOTP = async (email: string) => {
  const formData = new FormData();
  formData.append("email", email);
  const res = await axios.post(`${apiUrl}/send-otp`, formData);
  return res.data;
};

export const VerifyOTP = async (email: string, otp: string) => {
  const formData = new FormData();
  formData.append("email", email);
  formData.append("otp", otp);
  const res = await axios.post(`${apiUrl}/verify-otp`, formData);
  return res.data;
};

export {
  GetGender,
};
