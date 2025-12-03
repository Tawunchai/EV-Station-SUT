import axios from "axios";
import { ReviewInterface } from "../interface/IReview";
import { UsersInterface } from "../interface/IUser";
import { NewsInterface } from "../interface/INews";
import { GetstartedInterface } from "../interface/IGetstarted";
import { EVchargingInterface,EVChargingPayListmentInterface } from "../interface/IEV";
import { EmployeeInterface, CreateEmployeeInput } from "../interface/IEmployee";
import { CalendarInterface } from "../interface/ICalendar";
import { GendersInterface } from "../interface/IGender";
import { UserroleInterface } from "../interface/IUserrole";
import { TypeInterface } from "../interface/IType";
import { StatusInterface } from "../interface/IStatus";
import { ReportInterface } from "../interface/IReport";
import { PaymentsInterface, EVChargingPaymentInterface, PaymentCreateInterface, PaymentInterface } from "../interface/IPayment";
import { MethodInterface } from "../interface/IMethod";
import { InverterStatus } from "../interface/IInverterStatus"
import { BankInterface } from "../interface/IBank"
import { PaymentCoinInterface } from "../interface/IPaymentCoin";
import { CarsInterface } from "../interface/ICar";
import { ServiceInterface } from "../interface/IService";
import { SendEmailInterface } from "../interface/ISendEmail";
import { BookingInterface,EVCabinetInterface } from "../interface/IBooking";
import { ModalInterface } from "../interface/ICarCatalog";
import { BrandInterface } from "../interface/IBrand";
import { ChargingSessionInterface } from "../interface/IToken";
import { EnergySourceInterface } from "../interface/IEnergySource";
import { SolarInterface } from "../interface/ISolar";
import { HardwareInterface } from "../interface/IHardware";

//export const apiUrl = "http://10.0.14.228:8000";
//export const apiUrlPicture = "http://10.0.14.228:8000/";
//export const apiUrl = "http://10.167.17.128:8000";
//export const apiUrlPicture = "http://10.167.17.128:8000/";
//export const apiUrlPicture = "http://localhost:8000/";
//export const apiUrl = "http://localhost:8000";
//export const apiUrlPicture = "http://192.168.1.141:8000/";
//export const apiUrl = "http://192.168.1.141:8000";
export const apiUrlPicture = "https://api.evstation-sut.it.com/";
export const apiUrl = "https://api.evstation-sut.it.com";

const getAuthHeader = () => {
  const token = localStorage.getItem("token");
  const tokenType = localStorage.getItem("token_type");
  return { Authorization: `${tokenType} ${token}` };
};

const getRequestOptions = () => {
  const Authorization = localStorage.getItem("token");
  const Bearer = localStorage.getItem("token_type");
  return {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `${Bearer} ${Authorization}`,
    },
  };
};

const deleteRequestOptions = () => {
  const Authorization = localStorage.getItem("token");
  const Bearer = localStorage.getItem("token_type");
  return {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `${Bearer} ${Authorization}`,
    },
  };
};

const postRequestOptions = (body: any) => {
  const Authorization = localStorage.getItem("token");
  const Bearer = localStorage.getItem("token_type");
  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `${Bearer} ${Authorization}`,
    },
    body: JSON.stringify(body),
  };
};
export interface CarInterface {
  brand: string;
  model_car: string;
  license_plate: string;
  city: string;
  special_number?: boolean;
  user_id: number; // ✅ เพิ่มฟิลด์ user_id
}

export const CreateCar = async (
  carData: CarInterface
): Promise<{ message: string; data: CarInterface } | null> => {
  try {
    const response = await axios.post(`${apiUrl}/car-create`, carData, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 201) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error creating car:", error.response?.data || error.message);
    return null;
  }
};


export const GetInverterStatus = async (): Promise<InverterStatus | null> => {
  try {
    const response = await axios.get(`${apiUrl}/inverter`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(), // ถ้ามีการ auth ด้วย token
      },
    });

    if (response.status === 200) {
      return response.data; // เป็น InverterStatus
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error) {
    console.error("Error fetching inverter status:", error);
    return null;
  }
};

export const uploadSlip = async (file: File): Promise<any | null> => {
  try {
    const formData = new FormData();
    formData.append("file", file);

    const response = await axios.post(`${apiUrl}/api/check-slip`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error uploading slip:", error.response?.data || error.message);
    return null;
  }
};

export const uploadSlipOK = async (file: File): Promise<any | null> => {
  try {
    const base64 = await convertToBase64(file);
    if (!base64) throw new Error("ไม่สามารถแปลงไฟล์เป็น base64");

    // ส่งไปยัง backend แบบไม่ต้องมี amount ใน URL
    const response = await axios.post(`${apiUrl}/api/check-slipok`, {
      img: base64, // ส่ง base64 พร้อม prefix
    });

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error checking slip:", error.response?.data || error.message);
    return null;
  }
};

// ฟังก์ชันช่วยแปลงไฟล์ภาพเป็น base64
const convertToBase64 = (file: File): Promise<string | null> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => resolve(null);
  });
};


export interface PromptPayChargeRequest {
  amount: number; // จำนวนเงินเป็น "บาท"
}

export interface PromptPayChargeResponse {
  // สามารถปรับได้ตามโครงสร้างที่ backend ส่งกลับ เช่น Omise charge object
  [key: string]: any;
}

export const createPromptPayCharge = async (
  chargeData: PromptPayChargeRequest
): Promise<PromptPayChargeResponse | null> => {
  try {
    const response = await axios.post(`${apiUrl}/api/create-promptpay-charge`, chargeData, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (response.status === 200) {
      return response.data as PromptPayChargeResponse;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error creating PromptPay charge:", error.response?.data || error.message);
    return null;
  }
};

export interface ChargeRequest {
  amount: number;  // จำนวนเงินเป็นบาท เช่น 100
  token: string;   // Omise token ที่ได้จาก Omise.js ฝั่ง client
}

export interface ChargeResponse {
  // โครงสร้าง response จาก Omise API อาจจะยืดหยุ่น จึงใช้ any
  [key: string]: any;
}

export const createCharge = async (
  chargeData: ChargeRequest
): Promise<ChargeResponse | null> => {
  try {
    const response = await axios.post(`${apiUrl}/api/charge`, chargeData, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (response.status === 200) {
      return response.data as ChargeResponse;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error creating charge:", error.response?.data || error.message);
    return null;
  }
};

export const UpdateUserProfileByID = async (
  id: number,
  formData: FormData
): Promise<boolean> => {
  try {
    const res = await axios.patch(`${apiUrl}/update-user-profile/${id}`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
        ...getAuthHeader(), // ถ้ามี JWT ใช้ header นี้
      },
    });

    if (res.status === 200) {
      console.log("✅ User profile updated successfully:", res.data);
      return true;
    }

    console.warn("⚠️ Unexpected status:", res.status);
    return false;
  } catch (error: any) {
    console.error("❌ Error updating user profile:", error);
    return false;
  }
};

export const createEmployeeByAdmin = async (
  employeeData: CreateEmployeeInput
): Promise<EmployeeInterface | null> => {
  try {
    const response = await axios.post(`${apiUrl}/create-employees`, employeeData, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 201) {
      return response.data.employee as EmployeeInterface;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error creating employee:", error.response?.data || error.message);
    return null;
  }
};

export const getEmployeeByID = async (
  id: number
): Promise<EmployeeInterface | null> => {
  try {
    const response = await axios.get(`${apiUrl}/employeebyid/${id}`, {
      headers: {
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data as EmployeeInterface;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error fetching employee:", error.response?.data || error.message);
    return null;
  }
};

// ✅ อัปเดตข้อมูลพนักงาน (PATCH /update-employee-profile/:id)
export const UpdateEmployeeProfile = async (
  id: number,
  data: FormData
): Promise<EmployeeInterface | null> => {
  try {
    const res = await axios.patch(`${apiUrl}/update-employee-profile/${id}`, data, {
      headers: {
        "Content-Type": "multipart/form-data",
        ...getAuthHeader(),
      },
    });

    if (res.status === 200) {
      console.log("✅ Employee profile updated successfully");
      return res.data.employee as EmployeeInterface;
    }

    console.error("Unexpected status:", res.status);
    return null;
  } catch (err) {
    console.error("❌ Error updating employee profile:", err);
    return null;
  }
};

export interface UpdateCoinInput {
  user_id: number;
  coin: number;
}

export const UpdateCoin = async (data: UpdateCoinInput): Promise<boolean> => {
  try {
    const response = await axios.put(`${apiUrl}/users/update-coin`, data, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return true;
    } else {
      console.error("Unexpected status:", response.status);
      return false;
    }
  } catch (error) {
    console.error("Error updating coin:", error);
    return false;
  }
};

export const ListReviews = async (): Promise<ReviewInterface[] | null> => {
  try {
    const response = await axios.get(`${apiUrl}/reviews`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data; // เป็น array ของ ReviewInterface
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error) {
    console.error("Error fetching reviews:", error);
    return null;
  }
};

export const ListReviewsVisible = async (): Promise<ReviewInterface[] | null> => {
  try {
    const res = await axios.get(`${apiUrl}/reviews/visible`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });
    if (res.status === 200) return res.data as ReviewInterface[];
    console.error("Unexpected status:", res.status);
    return null;
  } catch (err) {
    console.error("Error fetching visible reviews:", err);
    return null;
  }
};

/** อัปเดตสถานะการมองเห็นรีวิว (true/false) ตาม ID */
export const UpdateReviewStatusByID = async (
  id: number | string,
  status: boolean
): Promise<ReviewInterface | null> => {
  try {
    const res = await axios.patch(
      `${apiUrl}/reviews/${id}/status`,
      { status },
      {
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
      }
    );
    if (res.status === 200) return res.data as ReviewInterface;
    console.error("Unexpected status:", res.status);
    return null;
  } catch (err) {
    console.error(`Error updating review status (id=${id}):`, err);
    return null;
  }
};

/** ลบรีวิวตาม ID (ฝั่ง backend เป็น soft delete จาก gorm.Model) */
export const DeleteReviewByID = async (id: number | string): Promise<boolean> => {
  try {
    const res = await axios.delete(`${apiUrl}/reviews/${id}`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });
    if (res.status === 200) return true;
    console.error("Unexpected status:", res.status);
    return false;
  } catch (err) {
    console.error(`Error deleting review (id=${id}):`, err);
    return false;
  }
};

export const onLikeButtonClick = async (
  reviewID: number,
  userID: number
): Promise<any | false> => {
  try {
    const postOptions = postRequestOptions({
      user_id: userID,
      review_id: reviewID,
    });

    const response = await fetch(`${apiUrl}/reviews/like`, postOptions);

    if (!response.ok) throw new Error("การตอบสนองของเครือข่ายไม่ถูกต้อง");
    return await response.json();
  } catch (error) {
    console.error("ข้อผิดพลาดในการกดไลค์:", error);
    return false;
  }
};

export const fetchLikeStatus = async (
  reviewID: number,
  userID: number
): Promise<{ hasLiked: boolean; likeCount: number } | false> => {
  try {
    const requestOptions = getRequestOptions();

    const response = await fetch(
      `${apiUrl}/reviews/${userID}/${reviewID}/like`,
      requestOptions
    );

    if (!response.ok) throw new Error("การตอบสนองของเครือข่ายไม่ถูกต้อง");
    const data = await response.json();
    return {
      hasLiked: data.hasLiked ?? false,
      likeCount: data.likeCount ?? 0,
    };
  } catch (error) {
    console.error("ข้อผิดพลาดในการดึงสถานะไลค์:", error);
    return false;
  }
};

export const onUnlikeButtonClick = async (reviewID: number, userID: number) => {
  try {
    const deleteOptions = deleteRequestOptions();

    const response = await fetch(`${apiUrl}/reviews/unlike`, {
      ...deleteOptions,
      body: JSON.stringify({ user_id: userID, review_id: reviewID }),
    });

    if (!response.ok) throw new Error("การตอบสนองของเครือข่ายไม่ถูกต้อง");
    return await response.json();
  } catch (error) {
    console.error("ข้อผิดพลาดในการยกเลิกไลค์:", error);
    return false;
  }
};

export const getUserByID = async (
  id: number
): Promise<UsersInterface | null> => {
  try {
    const response = await axios.get(`${apiUrl}/users/${id}`, {
      headers: {
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data as UsersInterface;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error fetching user:", error.response?.data || error.message);
    return null;
  }
};

export const CreateUser = async (
  userData: UsersInterface | FormData
): Promise<{ message: string; user: any } | null> => {
  try {
    const headers = userData instanceof FormData
      ? {
        ...getAuthHeader(),
      }
      : {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      };

    const response = await axios.post(`${apiUrl}/create-user`, userData, {
      headers,
    });

    if (response.status === 201) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error creating user:", error.response?.data || error.message);
    return null;
  }
};

// News Services
export const ListNews = async (): Promise<NewsInterface[] | null> => {
  try {
    const response = await axios.get(`${apiUrl}/news`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data; // ควรเป็น [] ของข่าว
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error) {
    console.error("Error fetching news:", error);
    return null;
  }
};

export const CreateNews = async (formData: FormData): Promise<{ message: string; data: any } | null> => {
  try {
    const response = await axios.post(`${apiUrl}/create-news`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
        ...getAuthHeader(),
      },
    });
    if (response.status === 201) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error creating news:", error.response?.data || error.message);
    return null;
  }
};

export const UpdateNewsByID = async (
  id: number,
  formData: FormData
): Promise<{ message: string; data: any } | null> => {
  try {
    const response = await axios.patch(`${apiUrl}/update-news/${id}`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error updating news:", error.response?.data || error.message);
    return null;
  }
};


export const DeleteNews = async (
  id: number
): Promise<{ message: string } | null> => {
  try {
    const response = await axios.delete(`${apiUrl}/delete-news/${id}`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error deleting news:", error.response?.data || error.message);
    return null;
  }
};

export const ListReports = async (): Promise<ReportInterface[] | null> => {
  try {
    const response = await axios.get(`${apiUrl}/reports`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data; // คาดว่า backend ส่ง array ของ ReportInterface
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error) {
    console.error("Error fetching reports:", error);
    return null;
  }
};

export const CreateReport = async (
  formData: FormData
): Promise<{ message: string; data: any } | null> => {
  try {
    const response = await axios.post(`${apiUrl}/create-report`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
        ...getAuthHeader(),
      },
    });

    if (response.status === 201) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error creating report:", error.response?.data || error.message);
    return null;
  }
};

export const UpdateReportByID = async (
  id: number,
  status: string
): Promise<{ message: string; data: any } | null> => {
  try {
    const response = await axios.put(`${apiUrl}/update-reports/${id}`, { status }, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error updating report:", error.response?.data || error.message);
    return null;
  }
};

export const DeleteReportByID = async (
  id: number
): Promise<{ message: string } | null> => {
  try {
    const response = await axios.delete(`${apiUrl}/delete-report/${id}`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error deleting report:", error.response?.data || error.message);
    return null;
  }
};

export const ListGetStarted = async (): Promise<GetstartedInterface[] | null> => {
  try {
    const response = await axios.get(`${apiUrl}/getstarteds`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error) {
    console.error("Error fetching get started list:", error);
    return null;
  }
};

export type CreateGettingStartedInput = {
  title: string;
  description: string;
  employeeID?: number;
  picture: File; // บังคับมีไฟล์
};

export const CreateGettingStarted = async (formData: FormData): Promise<{ message: string; data: any } | null> => {
  try {
    const response = await axios.post(`${apiUrl}/create-getting`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
        ...getAuthHeader(),
      },
    });
    if (response.status === 201) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error creating gettings:", error.response?.data || error.message);
    return null;
  }
};


export const UpdateGettingStartedByID = async (
  id: number,
  formData: FormData
): Promise<{ message: string; data: any } | null> => {
  try {
    const response = await axios.patch(`${apiUrl}/update-gettings/${id}`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error updating news:", error.response?.data || error.message);
    return null;
  }
};


export const DeleteGettingByID = async (
  id: number
): Promise<{ message: string } | null> => {
  try {
    const response = await axios.delete(`${apiUrl}/delete-gettings/${id}`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error deleting GettingStarted:", error.response?.data || error.message);
    return null;
  }
};


export const ListUsers = async (): Promise<UsersInterface[] | null> => {
  try {
    const response = await axios.get(`${apiUrl}/users`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error) {
    console.error("Error fetching user list:", error);
    return null;
  }
};

export const DeleteUser = async (
  id: number
): Promise<{ message: string } | null> => {
  try {
    const response = await axios.delete(`${apiUrl}/delete-users/${id}`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error deleting user:", error.response?.data || error.message);
    return null;
  }
};

export const ListUsersByRoleAdmin = async (): Promise<UsersInterface[] | null> => {
  try {
    const response = await axios.get(`${apiUrl}/users/by-role/admin`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error) {
    console.error("Error fetching user list by role Admin:", error);
    return null;
  }
};


export const ListUsersByRoleUser = async (): Promise<UsersInterface[] | null> => {
  try {
    const response = await axios.get(`${apiUrl}/users/by-role/user`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error) {
    console.error("Error fetching user list by role User:", error);
    return null;
  }
};

export const ListEVCharging = async (): Promise<EVchargingInterface[] | null> => {
  try {
    const response = await axios.get(`${apiUrl}/evs`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error) {
    console.error("Error fetching EV charging data:", error);
    return null;
  }
};

export const CreateEV = async (
  formData: FormData
): Promise<{ message: string; data: EVchargingInterface } | null> => {
  try {
    const response = await axios.post(`${apiUrl}/create-evs`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
        ...getAuthHeader(),
      },
    });

    if (response.status === 201) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error creating EVcharging:", error.response?.data || error.message);
    return null;
  }
};

export const UpdateEVByID = async (
  id: number,
  formData: FormData
): Promise<{ message: string; data: EVchargingInterface } | null> => {
  try {
    const response = await axios.patch(`${apiUrl}/update-evs/${id}`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error updating EV Charging:", error.response?.data || error.message);
    return null;
  }
};


export const DeleteEVcharging = async (
  id: number
): Promise<{ message: string } | null> => {
  try {
    const response = await axios.delete(`${apiUrl}/delete-evchargings/${id}`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error deleting EVcharging:", error.response?.data || error.message);
    return null;
  }
};

//Type
export const ListTypeEV = async (): Promise<TypeInterface[] | null> => {
  try {
    const response = await axios.get(`${apiUrl}/types`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error fetching EV Types:", error.response?.data || error.message);
    return null;
  }
};

//Status
export const ListStatus = async (): Promise<StatusInterface[] | null> => {
  try {
    const response = await axios.get(`${apiUrl}/statuss`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error fetching Status list:", error.response?.data || error.message);
    return null;
  }
};

// services/employee.ts
export const GetEmployeeByUserID = async (id: number): Promise<EmployeeInterface | null> => {
  try {
    const response = await axios.get(`${apiUrl}/employees/user/${id}`);
    if (response.status === 200) return response.data;
    return null;
  } catch (error) {
    console.error("Error fetching employee by user ID", error);
    return null;
  }
};

export const UpdateAdminByID = async (
  id: number,
  data: Partial<Pick<EmployeeInterface, "Salary">> & {
    userRoleID?: number;
    password?: string; // ✅ เพิ่ม password ที่นี่
  }
): Promise<{ message: string; data: EmployeeInterface } | null> => {
  try {
    // ✅ สร้าง payload เป็น JSON object ที่ยืดหยุ่น
    const payload: any = {};

    if (data.Salary !== undefined) {
      payload.salary = data.Salary;
    }

    if (data.userRoleID !== undefined) {
      payload.userRoleID = data.userRoleID;
    }

    if (data.password !== undefined && data.password.trim() !== "") {
      payload.password = data.password.trim(); // ✅ ส่งเฉพาะเมื่อไม่ว่าง
    }

    const response = await axios.patch(
      `${apiUrl}/update-boss-admins/${id}`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
      }
    );

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status code:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error updating admin:", error.response?.data || error.message);
    return null;
  }
};

export const DeleteAdmin = async (
  id: number
): Promise<{ message: string } | null> => {
  try {
    const response = await axios.delete(`${apiUrl}/delete-admins/${id}`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error deleting admin:", error.response?.data || error.message);
    return null;
  }
};


export const CreateCalendar = async (
  calendarData: CalendarInterface
): Promise<{ message: string; calendar: CalendarInterface } | null> => {
  try {
    const response = await axios.post(`${apiUrl}/create-calendar`, calendarData, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 201) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error creating calendar:", error.response?.data || error.message);
    return null;
  }
};


export const ListCalendars = async (): Promise<CalendarInterface[] | null> => {
  try {
    const response = await axios.get(`${apiUrl}/calendars`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error fetching calendars:", error.response?.data || error.message);
    return null;
  }
};

export const UpdateCalendar = async (
  id: number,
  calendarData: CalendarInterface
): Promise<{ message: string; calendar: CalendarInterface } | null> => {
  try {
    const response = await axios.put(`${apiUrl}/update-calendar/${id}`, calendarData, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error updating calendar:", error.response?.data || error.message);
    return null;
  }
};

export const DeleteCalendar = async (
  id: number
): Promise<{ message: string } | null> => {
  try {
    const response = await axios.delete(`${apiUrl}/delete-calendar/${id}`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error deleting calendar:", error.response?.data || error.message);
    return null;
  }
};

export const UpdateUser = async (
  id: number,
  data: Partial<UsersInterface>
): Promise<{ message: string; user: UsersInterface } | null> => {
  try {
    const response = await axios.patch(`${apiUrl}/update-user/${id}`, data, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status code:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error updating user:", error.response?.data || error.message);
    return null;
  }
};

export const ListGenders = async (): Promise<GendersInterface[] | null> => {
  try {
    const response = await axios.get(`${apiUrl}/genders`);
    if (response.status === 200) {
      return response.data;
    }
    return null;
  } catch (error) {
    console.error("Error fetching genders:", error);
    return null;
  }
};

export const ListUserRoles = async (): Promise<UserroleInterface[] | null> => {
  try {
    const response = await axios.get(`${apiUrl}/userroles`);
    if (response.status === 200) {
      return response.data;
    }
    return null;
  } catch (error) {
    console.error("Error fetching user roles:", error);
    return null;
  }
};

export const ListMethods = async (): Promise<MethodInterface[] | null> => {
  try {
    const response = await axios.get(`${apiUrl}/methods`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(), // ถ้ามี auth
      },
    });

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error) {
    console.error("Error fetching methods list:", error);
    return null;
  }
};

export const ListPayments = async (): Promise<PaymentsInterface[] | null> => {
  try {
    const response = await axios.get(`${apiUrl}/payments`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error) {
    console.error("Error fetching payments list:", error);
    return null;
  }
};

export const GetReviewByUserID = async (
  userID: number
): Promise<ReviewInterface[] | null> => {
  try {
    const response = await axios.get(`${apiUrl}/reviews/user/${userID}`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error fetching reviews by user ID:", error.response?.data || error.message);
    return null;
  }
};

export const ListPaymentsByUserID = async (
  user_id: number
): Promise<PaymentsInterface[] | null> => {
  try {
    const response = await axios.get(`${apiUrl}/payments/user/${user_id}`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error) {
    console.error("Error fetching payments by user ID:", error);
    return null;
  }
};

export const GetPaymentByPaymentID = async (
  payment_id: number
): Promise<PaymentsInterface | null> => {
  try {
    const response = await axios.get(
      `${apiUrl}/payments/${payment_id}`,
      {
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
      }
    );

    if (response.status === 200) {
      return response.data.data as PaymentsInterface;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error) {
    console.error("Error fetching payment by payment ID:", error);
    return null;
  }
};

export const ListPaymentCoinsByUserID = async (
  user_id: number
): Promise<PaymentCoinInterface[] | null> => {
  try {
    const response = await axios.get(`${apiUrl}/payment-coins/${user_id}`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    // ตรวจสอบสถานะและ return ข้อมูล
    if (response.status === 200) {
      // หาก backend ส่งข้อมูลในรูปแบบ { data: [...] }
      if (response.data?.data) {
        return response.data.data;
      }
      // กรณี response เป็น array โดยตรง
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error) {
    console.error("Error fetching payment coins by user ID:", error);
    return null;
  }
};

export const CreateReview = async (
  reviewData: {
    rating: number;
    comment: string;
    user_id: number;
  }
): Promise<any | false> => {
  try {
    const Authorization = localStorage.getItem("token");
    const Bearer = localStorage.getItem("token_type");

    const requestOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${Bearer} ${Authorization}`,
      },
      body: JSON.stringify(reviewData),
    };

    const response = await fetch(`${apiUrl}/reviews-create`, requestOptions);

    if (!response.ok) {
      console.error("Response status:", response.status);
      throw new Error("Invalid response from server");
    }

    const data = await response.json();
    console.log("Response data:", data);
    return data;
  } catch (error) {
    console.error("Error creating review:", error);
    return false;
  }
};


export const CreateEVChargingPayment = async (
  paymentData: EVChargingPaymentInterface
): Promise<EVChargingPaymentInterface | null> => {
  try {
    const response = await axios.post(
      `${apiUrl}/create-evchargingpayments`,
      paymentData,
      {
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
      }
    );

    if (response.status === 200 || response.status === 201) {
      return response.data; // ข้อมูล EVChargingPayment ที่ถูกสร้างจาก backend
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error creating EVChargingPayment:", error.response?.data || error.message);
    return null;
  }
};

export const ListEVChargingPayments = async (): Promise<EVChargingPayListmentInterface[] | null> => {
  try {
    const response = await axios.get(`${apiUrl}/evcharging-payments`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error fetching EV charging payments:", error.response?.data || error.message);
    return null;
  }
};

export const CreatePayment = async (
  paymentData: PaymentCreateInterface
): Promise<PaymentInterface | null> => {
  try {
    const formData = new FormData();

    formData.append("date", paymentData.date);
    formData.append("amount", paymentData.amount.toString());
    formData.append("user_id", paymentData.user_id.toString());
    formData.append("method_id", paymentData.method_id.toString());
    formData.append("reference_number", paymentData.reference_number || "");

    // ⭐⭐ เพิ่มส่ง Cabinet ID
    if (paymentData.ev_cabinet_id) {
      formData.append("ev_cabinet_id", paymentData.ev_cabinet_id.toString());
    }

    // แนบรูปถ้ามี
    if (paymentData.picture instanceof File) {
      formData.append("picture", paymentData.picture);
    }

    const response = await axios.post(`${apiUrl}/create-payments`, formData, {
      headers: {
        ...getAuthHeader(),
      },
    });

    if (response.status === 200 || response.status === 201) {
      return response.data.data as PaymentInterface;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error creating Payment:", error.response?.data || error.message);
    return null;
  }
};


// ฟังก์ชันดึงรายการธนาคาร
export const ListBank = async (): Promise<BankInterface[] | null> => {
  try {
    const response = await axios.get(`${apiUrl}/banks`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error) {
    console.error("Error fetching banks list:", error);
    return null;
  }
};

// ฟังก์ชัน PATCH อัปเดตข้อมูลธนาคาร
export const UpdateBank = async (
  id: number,
  data: { promptpay?: string; manager?: string; banking?: string; minimum?: number }
): Promise<BankInterface | null> => {
  try {
    const response = await axios.patch(`${apiUrl}/banks/${id}`, data, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data.data; // ตามโครงสร้าง response จาก backend
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error) {
    console.error("Error updating bank:", error);
    return null;
  }
};

export const ListPaymentCoins = async (): Promise<PaymentCoinInterface[] | null> => {
  try {
    const response = await axios.get(`${apiUrl}/payment-coins`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error) {
    console.error("Error fetching payment coins:", error);
    return null;
  }
};

export const CreatePaymentCoin = async (data: any) => {
  try {
    const formData = new FormData();
    formData.append("Date", data.Date);
    formData.append("Amount", data.Amount);
    formData.append("ReferenceNumber", data.ReferenceNumber);
    formData.append("UserID", data.UserID);
    formData.append("Picture", data.Picture); // <<< File

    const response = await axios.post(
      `${apiUrl}/create-payment-coins`,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
          ...getAuthHeader(),
        },
      }
    );
    if (response.status === 201) {
      return response.data;
    }
    return null;
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const GetCarByUserID = async (
  userID: number
): Promise<CarsInterface[] | null> => {
  try {
    const response = await axios.get(`${apiUrl}/cars/user/${userID}`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error(
      "Error fetching cars by user ID:",
      error.response?.data || error.message
    );
    return null;
  }
};

export const UpdateCarByID = async (
  id: number,
  data: Partial<CarsInterface>
): Promise<{ message: string; data: CarsInterface } | null> => {
  try {
    const response = await axios.put(`${apiUrl}/cars/${id}`, data, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error updating car:", error.response?.data || error.message);
    return null;
  }
};

// ✅ Get report by ID
export const GetReportByID = async (id: number): Promise<ReportInterface | null> => {
  try {
    const response = await axios.get(`${apiUrl}/report/${id}`, {
      headers: getAuthHeader(),
    });
    if (response.status === 200) {
      return response.data.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error fetching report:", error.response?.data || error.message);
    return null;
  }
};

export const ListServices = async (): Promise<ServiceInterface[] | null> => {
  try {
    const response = await axios.get(`${apiUrl}/services`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data; // array ของ ServiceInterface
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error) {
    console.error("Error fetching services:", error);
    return null;
  }
};


export const UpdateServiceByID = async (
  id: number,
  data: Partial<ServiceInterface>
): Promise<{ message: string; data: ServiceInterface } | null> => {
  try {
    const response = await axios.put(`${apiUrl}/services/${id}`, data, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error updating service:", error.response?.data || error.message);
    return null;
  }
};

export const ListCars = async (): Promise<CarsInterface[] | null> => {
  try {
    const response = await axios.get(`${apiUrl}/cars`, {
      headers: {
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error fetching cars:", error.response?.data || error.message);
    return null;
  }
};

export const DeleteCar = async (id: number): Promise<boolean> => {
  try {
    const response = await axios.delete(`${apiUrl}/cars/${id}`, {
      headers: {
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      console.log("Car deleted:", response.data);
      return true;
    } else {
      console.error("Unexpected status:", response.status);
      return false;
    }
  } catch (error: any) {
    console.error("Error deleting car:", error.response?.data || error.message);
    return false;
  }
};

export const ListSendEmails = async (): Promise<SendEmailInterface[] | null> => {
  try {
    const response = await axios.get(`${apiUrl}/send-emails`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error) {
    console.error("Error fetching send email list:", error);
    return null;
  }
};

export const UpdateSendEmailByID = async (
  id: number,
  data: Partial<SendEmailInterface>
): Promise<{ message: string; data: SendEmailInterface } | null> => {
  try {
    const response = await axios.patch(`${apiUrl}/send-email/${id}`, data, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error updating send email:", error.response?.data || error.message);
    return null;
  }
};

interface CreateBookingPayload {
  start_date: Date;
  end_date: Date;
  user_id: number;
  ev_cabinet_id: number;
}

// ✅ สร้างการจองใหม่ Use
export const CreateBooking = async (data: CreateBookingPayload): Promise<any | null> => {
  try {
    const response = await axios.post(`${apiUrl}/create-bookings`, data, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });
    if (response.status === 201) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error creating booking:", error.response?.data || error.message);
    return null;
  }
};

// ✅ ดึงรายการการจองทั้งหมด 
export const ListBooking = async (): Promise<BookingInterface[] | null> => {
  try {
    const response = await axios.get(`${apiUrl}/bookings`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });
    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error fetching bookings:", error.response?.data || error.message);
    return null;
  }
};

// ✅ ดึงการจองตาม User ID Use
export const ListBookingByUserID = async (userId: number): Promise<BookingInterface[] | null> => {
  try {
    const response = await axios.get(`${apiUrl}/booking/${userId}`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });
    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error fetching bookings by user ID:", error.response?.data || error.message);
    return null;
  }
};

// ✅ ลบการจองตาม ID
export const DeleteBookingByID = async (id: number): Promise<boolean> => {
  try {
    const response = await axios.delete(`${apiUrl}/delete-booking/${id}`, {
      headers: {
        ...getAuthHeader(),
      },
    });
    if (response.status === 200) {
      return true;
    } else {
      console.error("Unexpected status:", response.status);
      return false;
    }
  } catch (error: any) {
    console.error("Error deleting booking:", error.response?.data || error.message);
    return false;
  }
};

export type UpdateBookingPayload = {
  start_date: string;   // ส่งเป็น ISO string ดีสุด
  end_date: string;
  ev_cabinet_id: number;
};

export const UpdateBookingByID = async (
  id: number,
  data: UpdateBookingPayload
): Promise<any | null> => {
  try {
    const res = await axios.put(`${apiUrl}/update-booking/${id}`, data, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });
    return res.status === 200 ? res.data : null;
  } catch (e: any) {
    console.error("Error updating booking:", e.response?.data || e.message);
    return null;
  }
};

export const ListCabinetsEV = async (): Promise<EVCabinetInterface[] | null> => {
  try {
    const response = await axios.get(`${apiUrl}/ev-cabinets`, {
      headers: {
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error fetching EV cabinets:", error.response?.data || error.message);
    return null;
  }
};

export const GetCabinetByID = async (
  id: number
): Promise<EVCabinetInterface | null> => {
  try {
    const response = await axios.get(`${apiUrl}/ev-cabinets/${id}`, {
      headers: {
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data as EVCabinetInterface;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error(
      "Error fetching EV cabinet by ID:",
      error?.response?.data || error.message
    );
    return null;
  }
};

// services/bookingService.ts Use
export const ListBookingByEVCabinetIDandStartDate = async (
  evCabinetID: number,
  date: string
) => {
  try {
    const response = await axios.get(
      `${apiUrl}/bookings/evcabinet/${evCabinetID}/date?date=${date}`,
      {
        headers: {
          ...getAuthHeader(),
        },
      }
    );

    if (response.status === 200) {
      return response.data;
    }
    return null;
  } catch (error: any) {
    console.error(
      "Error fetching bookings by EVCabinetID and date:",
      error.response?.data || error.message
    );
    return null;
  }
};

export const CreateEVCabinet = async (formData: FormData): Promise<{ message: string; data: any } | null> => {
  try {
    const response = await axios.post(`${apiUrl}/create-evcabinet`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
        ...getAuthHeader(),
      },
    });
    if (response.status === 201) return response.data;
    return null;
  } catch (error: any) {
    console.error("Error creating EVCabinet:", error.response?.data || error.message);
    return null;
  }
};

export const UpdateEVCabinetByID = async (
  id: number,
  formData: FormData
): Promise<{ message: string; data: any } | null> => {
  try {
    const response = await axios.put(`${apiUrl}/evcabinet/${id}`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
        ...getAuthHeader(),
      },
    });
    if (response.status === 200) return response.data;
    return null;
  } catch (error: any) {
    console.error("Error updating EVCabinet:", error.response?.data || error.message);
    return null;
  }
};

export const DeleteEVCabinetByID = async (id: number): Promise<boolean> => {
  try {
    const response = await axios.delete(`${apiUrl}/evcabinet/${id}`, {
      headers: {
        ...getAuthHeader(),
      },
    });
    return response.status === 200;
  } catch (error: any) {
    console.error("Error deleting EVCabinet:", error.response?.data || error.message);
    return false;
  }
};

// ✅ DELETE หลายรายการพร้อมกัน
export const DeletePaymentCoins = async (ids: number[]) => {
  try {
    const response = await axios.delete(`${apiUrl}/payment-coins`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
      data: ids, // 🔸 axios จะส่ง body JSON array เช่น [1,2,3]
    });

    if (response.status === 200) {
      return response.data; // { message: "ลบ PaymentCoin ทั้งหมดสำเร็จพร้อมลบรูปภาพ", deleted: [...] }
    } else {
      return null;
    }
  } catch (error: any) {
    console.error("❌ DeletePaymentCoins error:", error.response?.data || error);
    return null;
  }
};

export const DeletePayments = async (ids: number[]) => {
  try {
    const response = await axios.delete(`${apiUrl}/payments`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
      data: ids, // ส่ง body เป็น JSON array เช่น [1,2,3]
    });

    if (response.status === 200) {
      return response.data; // { message, deleted }
    } else {
      return null;
    }
  } catch (error: any) {
    console.error("❌ DeletePayments error:", error.response?.data || error);
    return null;
  }
};

// ดึงรายการ Modal ทั้งหมด (พร้อม Brand ที่ preload มาด้วย)
export const ListModals = async (): Promise<ModalInterface[] | null> => {
  try {
    const response = await axios.get(`${apiUrl}/modals`, {
      headers: {
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data as ModalInterface[];
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error fetching modals:", error.response?.data || error.message);
    return null;
  }
};

export const CreateBrand = async (
  data: Partial<BrandInterface>
): Promise<BrandInterface | { error: string } | null> => {
  try {
    const response = await axios.post(`${apiUrl}/create-brand`, data, {
      headers: {
        ...getAuthHeader(),
      },
    });

    if (response.status === 201) {
      return response.data; // ✅ { Brand, default_modal } หรือ error message
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    const errMsg =
      error.response?.data?.error || error.response?.data || error.message;
    console.error("Error creating brand:", errMsg);
    return { error: errMsg };
  }
};

export const UpdateBrandByID = async (
  id: number,
  data: Partial<BrandInterface>
): Promise<
  | BrandInterface
  | { error: string }
  | { message: string; data: BrandInterface }
  | null
> => {
  try {
    const response = await axios.patch(`${apiUrl}/update-brand/${id}`, data, {
      headers: {
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data; // ✅ รองรับทั้ง {message, data} หรือ {error}
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    const errMsg =
      error.response?.data?.error || error.response?.data || error.message;
    console.error("Error updating brand:", errMsg);
    return { error: errMsg };
  }
};


export const DeleteBrandByID = async (id: number): Promise<boolean> => {
  try {
    const response = await axios.delete(`${apiUrl}/delete-brand/${id}`, {
      headers: {
        ...getAuthHeader(),
      },
    });

    return response.status === 200;
  } catch (error: any) {
    console.error("Error deleting brand:", error.response?.data || error.message);
    return false;
  }
};

export const CreateModal = async (data: Partial<ModalInterface>): Promise<ModalInterface | null> => {
  try {
    const response = await axios.post(`${apiUrl}/create-modal`, data, {
      headers: {
        ...getAuthHeader(),
      },
    });

    if (response.status === 201) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error creating modal:", error.response?.data || error.message);
    return null;
  }
};

export const UpdateModalByID = async (id: number, data: Partial<ModalInterface>): Promise<ModalInterface | null> => {
  try {
    const response = await axios.patch(`${apiUrl}/update-modal/${id}`, data, {
      headers: {
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error("Error updating modal:", error.response?.data || error.message);
    return null;
  }
};

export const DeleteModalByID = async (id: number): Promise<boolean> => {
  try {
    const response = await axios.delete(`${apiUrl}/delete-modal/${id}`, {
      headers: {
        ...getAuthHeader(),
      },
    });

    return response.status === 200;
  } catch (error: any) {
    console.error("Error deleting modal:", error.response?.data || error.message);
    return false;
  }
};

// services/token.ts
export const CreateChargingToken = async (
  userID: number,
  paymentID: number
): Promise<string | null> => {
  try {
    const res = await axios.post(
      `${apiUrl}/token/payment-success`,
      { user_id: userID, payment_id: paymentID },
      {
        headers: { "Content-Type": "application/json" },
      }
    );

    if (res.status === 200 && res.data.charging_token) {
      return res.data.charging_token;
    } else {
      console.error("Unexpected response:", res.data);
      return null;
    }
  } catch (err) {
    console.error("Error creating charging token:", err);
    return null;
  }
};


// ===========================
// 🟩 ตรวจสอบ Token ยังใช้ได้ไหม
// ===========================
export const VerifyChargingToken = async (token: string): Promise<boolean> => {
  try {
    const res = await axios.get(`${apiUrl}/token/verify`, {
      params: { token },
      headers: {
        "Content-Type": "application/json",
      },
    });

    return res.status === 200;
  } catch (err) {
    console.error("Error verifying charging token:", err);
    return false;
  }
};

// ✅ Interface (ถ้าต้องการ type)
export interface PaymentDataInterface {
  ID: number;
  Date: string;
  Amount: number;
  ReferenceNumber: string;
  Picture?: string;
  UserID?: number;
  type?: string;
  found?: boolean;
  message?: string;
}

// ✅ ดึงข้อมูลการชำระเงินจาก ReferenceNumber
export const GetDataPaymentByRef = async (
  ref: string
): Promise<PaymentDataInterface | null> => {
  try {
    const response = await axios.get(`${apiUrl}/ref/${ref}`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    if (error.response && error.response.status === 404) {
      console.warn(`ไม่พบข้อมูลการชำระเงินสำหรับ ref: ${ref}`);
    } else {
      console.error("Error fetching payment data:", error);
    }
    return null;
  }
};

export const connectOcppSocket = (onMessage: (data: any) => void) => {
  const ws = new WebSocket(`${apiUrl}/frontend`);

  ws.onopen = () => {
    console.log("✅ Connected to Go OCPP Server");
  };

  ws.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data);
      console.log("📩 Message:", parsed);
      onMessage(parsed);
    } catch {
      console.log("📩 Raw Message:", event.data);
      onMessage(event.data);
    }
  };

  ws.onclose = () => {
    console.log("⚠️ WebSocket disconnected");
  };

  ws.onerror = (err) => {
    console.error("❌ WebSocket error:", err);
  };

  return ws;
};

export const connectSolarSocket = (
  onMessage: (data: any) => void,
  deviceId: string
) => {
  // ⭐ ใส่ deviceID ใน query param
  const ws = new WebSocket(`${apiUrl}/solar/frontend?deviceID=${deviceId}`);

  ws.onopen = () => {
    console.log(
      `✅ Connected to Go Solar WebSocket Server for device: ${deviceId}`
    );
  };

  ws.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data);
      console.log("☀️ Received Solar Data:", parsed);
      onMessage(parsed);
    } catch {
      console.log("📩 Raw Message (non-JSON):", event.data);
      onMessage(event.data);
    }
  };

  ws.onclose = () => {
    console.log("⚠️ Solar WebSocket disconnected");
  };

  ws.onerror = (err) => {
    console.error("❌ Solar WebSocket error:", err);
  };

  return ws;
};

/** 🌐 เชื่อมต่อ WebSocket ไปยัง Backend Hardware */
export const connectHardwareSocket = (
  onMessage: (data: any) => void,
  deviceId: string
) => {
  if (!deviceId) {
    console.warn("⚠️ deviceId is required to connect hardware WebSocket");
    // จะ throw error หรือ return placeholder ก็ได้ แต่ตอนนี้ log ไว้เฉย ๆ
  }

  // 🔗 ต่อไปที่ /hardware/frontend พร้อม query ?deviceID=xxx
  const ws = new WebSocket(
    `${apiUrl}/hardware/frontend?deviceID=${encodeURIComponent(deviceId)}`
  );

  ws.onopen = () => {
    console.log(
      "✅ Connected to Go Hardware WebSocket Server for device:",
      deviceId
    );
  };

  ws.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data);
      console.log("📩 Received from Hardware:", parsed);
      onMessage(parsed);
    } catch {
      console.log("📩 Raw Message:", event.data);
      onMessage(event.data);
    }
  };

  ws.onclose = () => {
    console.warn("⚠️ Hardware WebSocket disconnected for device:", deviceId);
  };

  ws.onerror = (err) => {
    console.error("❌ Hardware WebSocket error:", err);
  };

  return ws;
};

/** 🔧 ส่งคำสั่งดึงข้อมูลพลังงาน (Solar + Grid) */
export const requestEnergyUsage = async (
  deviceID: string,
  paymentID?: number | string,
  energySources?: string[]
) => {
  try {
    const body: any = {
      device_id: deviceID,
    };

    // ⭐ แนบ payment_id ไปด้วย (ส่งเป็น string ปลอดภัยสุด)
    if (paymentID !== undefined && paymentID !== null) {
      body.payment_id = String(paymentID);
    }

    // ⭐ แนบ energy_sources → มาจาก Payment.EVChargingPayments[].EVcharging.EnergySource.Name
    if (energySources && energySources.length > 0) {
      body.energy_sources = energySources; // เช่น ["solar", "grid"]
    }

    const response = await axios.post(`${apiUrl}/hardware/request-energy`, body);

    console.log(
      "📤 Sent command: get_energy_usage →",
      deviceID,
      "payment_id:",
      body.payment_id,
      "energy_sources:",
      body.energy_sources
    );
    return response.data;
  } catch (err) {
    console.error("❌ Failed to request energy usage:", err);
    throw err;
  }
};

/** 📤 ส่งคำสั่งจาก Web → Backend → Hardware */
export const sendHardwareCommand = (
  ws: WebSocket,
  deviceId: string,
  command: Record<string, any>
) => {
  if (ws.readyState === WebSocket.OPEN) {
    const payload = {
      device_id: deviceId,
      command,
    };
    ws.send(JSON.stringify(payload));
    console.log("📤 Sent command to Backend:", payload);
  } else {
    console.warn("⚠️ WebSocket not connected — cannot send command.");
  }
};

export const GetChargingSessionByUserID = async (
  userID: number
): Promise<ChargingSessionInterface[] | null> => {
  try {
    const response = await axios.get(
      `${apiUrl}/charging-session/${userID}`,
      {
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
      }
    );

    if (response.status === 200) {
      return response.data.data; // ดึง array charging session ออกมา
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error) {
    console.error("Error fetching charging session:", error);
    return null;
  }
};

export const UpdateSessionStatusByPaymentID = async (
  paymentID: number
): Promise<boolean> => {
  try {
    const response = await axios.put(
      `${apiUrl}/charging-session/update-status/${paymentID}`,
      {},
      {
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
      }
    );

    if (response.status === 200) {
      console.log("🔥 อัปเดตสถานะ Charging Session สำเร็จ:", response.data);
      return true;
    } else {
      console.error("❗ Unexpected status:", response.status);
      return false;
    }
  } catch (error: any) {
    console.error(
      "❌ Error updating session status:",
      error.response?.data || error.message
    );
    return false;
  }
};

export const GetChargingSessionByStatusTrue = async (): Promise<any | null> => {
  try {
    const res = await axios.get(`${apiUrl}/charging-session/status/true`, {
      headers: {
        ...getAuthHeader(),
      },
    });

    if (res.status === 200) {
      return res.data.data;   // ⭐ object เดียว ไม่ใช่ array
    }

    return null;
  } catch (err) {
    console.error(err);
    return null;
  }
};

export const GetChargingSessionByStatusAndUserID = async (
  userID: number
): Promise<any> => {
  try {
    const response = await axios.get(
      `${apiUrl}/charging-session/status/${userID}`,
      {
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
      }
    );

    if (response.status === 200) {
      console.log("⚡ โหลด Charging Session สำเร็จ:", response.data);
      return response.data; // any
    } else {
      console.error("❗ Unexpected status:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error(
      "❌ Error fetching charging session:",
      error.response?.data || error.message
    );
    return null;
  }
};

export const ListEnergySource = async (): Promise<EnergySourceInterface[] | null> => {
  try {
    const response = await axios.get(`${apiUrl}/energy-sources`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error) {
    console.error("Error fetching energy source data:", error);
    return null;
  }
};

// ===============================
//   List Solar ทั้งหมด
//   GET /solars
// ===============================
export const ListSolar = async (): Promise<SolarInterface[] | null> => {
  try {
    const response = await axios.get(`${apiUrl}/solars`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data as SolarInterface[];
    } else {
      console.error("Unexpected status from ListSolar:", response.status);
      return null;
    }
  } catch (error) {
    console.error("Error fetching solars:", error);
    return null;
  }
};

// ===============================
//   ดึง Solar ตาม ID
//   GET /solar/:id
// ===============================
export const GetSolarByID = async (
  id: number
): Promise<SolarInterface | null> => {
  try {
    const response = await axios.get(`${apiUrl}/solars/${id}`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data as SolarInterface;
    } else {
      console.error("Unexpected status from GetSolarByID:", response.status);
      return null;
    }
  } catch (error) {
    console.error("Error fetching solar by id:", error);
    return null;
  }
};

// ===============================
//   Create Solar
//   POST /create-solar
//   ใช้ FormData คล้าย CreateNews (เพราะ backend ใช้ c.PostForm)
// ===============================
export const CreateSolar = async (
  formData: FormData
): Promise<{ message: string; data: SolarInterface } | null> => {
  try {
    const response = await axios.post(`${apiUrl}/create-solar`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
        ...getAuthHeader(),
      },
    });

    if (response.status === 201) {
      return response.data;
    } else {
      console.error("Unexpected status from CreateSolar:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error(
      "Error creating solar:",
      error.response?.data || error.message
    );
    return null;
  }
};

// ===============================
//   Update Solar by ID
//   PUT /update-solar/:id
//   ใช้ FormData เช่นเดียวกับ CreateSolar
// ===============================
export const UpdateSolarByID = async (
  id: number,
  formData: FormData
): Promise<{ message: string; data: SolarInterface } | null> => {
  try {
    const response = await axios.put(
      `${apiUrl}/update-solar/${id}`,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
          ...getAuthHeader(),
        },
      }
    );

    if (response.status === 200) {
      return response.data;
    } else {
      console.error("Unexpected status from UpdateSolarByID:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error(
      "Error updating solar:",
      error.response?.data || error.message
    );
    return null;
  }
};

// ===============================
//   Delete Solar by ID
//   DELETE /delete-solar/:id
// ===============================
export const DeleteSolar = async (
  id: number
): Promise<{ message: string } | null> => {
  try {
    const response = await axios.delete(`${apiUrl}/delete-solar/${id}`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data as { message: string };
    } else {
      console.error("Unexpected status from DeleteSolar:", response.status);
      return null;
    }
  } catch (error: any) {
    console.error(
      "Error deleting solar:",
      error.response?.data || error.message
    );
    return null;
  }
};

/**
 * ✅ GET /hardwares
 * ดึงรายการ Hardware ทั้งหมด
 */
export const ListHardwares = async (): Promise<HardwareInterface[] | null> => {
  try {
    const response = await axios.get(`${apiUrl}/hardwares`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      // รองรับทั้งแบบ { data: [...] } และ [...] ตรง ๆ
      const raw = (response.data as any)?.data ?? response.data;
      if (Array.isArray(raw)) {
        return raw as HardwareInterface[];
      }
      console.error("Invalid hardware list response format:", response.data);
      return null;
    } else {
      console.error("Unexpected status (ListHardwares):", response.status);
      return null;
    }
  } catch (error) {
    console.error("Error fetching hardwares:", error);
    return null;
  }
};

/**
 * ✅ POST /create-hardware
 * สร้าง Hardware ใหม่
 */
export const CreateHardware = async (
  payload: Omit<HardwareInterface, "ID" | "CreatedAt" | "UpdatedAt" | "DeletedAt">
): Promise<HardwareInterface | null> => {
  try {
    const response = await axios.post(`${apiUrl}/create-hardware`, payload, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 201 || response.status === 200) {
      // backend อาจส่ง { data: hw } หรือ { message, data } หรือ object ตรง ๆ
      const raw = (response.data as any)?.data ?? response.data;
      return raw as HardwareInterface;
    } else {
      console.error("Unexpected status (CreateHardware):", response.status);
      return null;
    }
  } catch (error) {
    console.error("Error creating hardware:", error);
    return null;
  }
};

/**
 * ✅ PATCH /update-hardware/:id
 * แก้ไข Hardware ตาม ID
 */
export const UpdateHardwareByID = async (
  id: number,
  payload: Partial<HardwareInterface>
): Promise<HardwareInterface | null> => {
  try {
    const response = await axios.patch(`${apiUrl}/update-hardware/${id}`, payload, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      const raw = (response.data as any)?.data ?? response.data;
      return raw as HardwareInterface;
    } else {
      console.error("Unexpected status (UpdateHardwareByID):", response.status);
      return null;
    }
  } catch (error) {
    console.error("Error updating hardware:", error);
    return null;
  }
};

/**
 * ✅ DELETE /hardware/:id
 * ลบ Hardware ตาม ID
 */
export const DeleteHardwareByID = async (id: number): Promise<boolean> => {
  try {
    const response = await axios.delete(`${apiUrl}/hardware/${id}`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return true;
    } else {
      console.error("Unexpected status (DeleteHardwareByID):", response.status);
      return false;
    }
  } catch (error: any) {
    console.error("Error deleting hardware:", error?.response?.data || error);
    return false;
  }
};

export const GetChargingSessionMonitor = async (
  chargePoint: string
): Promise<any[] | null> => {
  try {
    const response = await axios.get(
      `${apiUrl}/charging-session/monitor/${chargePoint}`,
      {
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
      }
    );

    if (response.status === 200) {
      return response.data.data; // ส่ง array sessions กลับไป
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error) {
    console.error("Error GetChargingSessionMonitor:", error);
    return null;
  }
};

// ดึงข้อมูล SolarRealtimeData ทั้งหมดของ device_id ที่ระบุ
export const ListSolarRealtimeDataByDeviceID = async (
  deviceID: string
): Promise<any[] | null> => {
  try {
    const response = await axios.get(`${apiUrl}/solar/realtime/${deviceID}`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return response.data; // เป็น array ของ SolarRealtimeData (ตอนนี้ใช้ any[])
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error) {
    console.error("Error fetching solar realtime data:", error);
    return null;
  }
};

export const DeleteSolarRealtimeDataByIDs = async (
  ids: number[]
): Promise<boolean> => {
  if (!ids || ids.length === 0) {
    console.error("DeleteSolarRealtimeDataByIDs: ids is empty");
    return false;
  }

  // ✅ บังคับให้เป็น number ล้วน (กันกรณีเป็น string จาก AntD rowSelection เช่น "1","2")
  const numericIds = ids.map((id) => Number(id)).filter((n) => !isNaN(n));

  if (numericIds.length === 0) {
    console.error("DeleteSolarRealtimeDataByIDs: numericIds is empty after parsing");
    return false;
  }

  try {
    const res = await axios.delete(`${apiUrl}/deletes-realtime`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(), // ถ้า route นี้ public จริง ๆ จะลบออกก็ได้
      },
      // axios.delete ต้องส่ง body ผ่าน field `data`
      data: {
        ids: numericIds,
      },
    });

    if (res.status === 200) {
      return true;
    }

    console.error("Unexpected status on delete solar realtime:", res.status);
    return false;
  } catch (err) {
    console.error("Error deleting solar realtime by ids:", err);
    return false;
  }
};
