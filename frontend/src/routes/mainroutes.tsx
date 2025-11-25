import { lazy, useEffect, useMemo, useState } from "react";
import { useRoutes, RouteObject, Navigate } from "react-router-dom";
import Loadable from "../component/third-patry/Loadable";
import { GetProfile } from "../services/httpLogin";

// ===== Public Pages =====
const Login = Loadable(lazy(() => import("../page/LoginForm1/LoginForm1")));
const SignUp = Loadable(lazy(() => import("../page/Signup1/Signup2Form")));
const ForgotPassword = Loadable(lazy(() => import("../page/ForgotPasswordForm/ForgotPasswordForm")));
const ResetPassword = Loadable(lazy(() => import("../page/ResetPassword/ResetPassword")));
const Loader = Loadable(lazy(() => import("../component/third-patry/Loader")));

// ===== User Pages =====
const User = Loadable(lazy(() => import("../page/user/index")));
const BookingEV = Loadable(lazy(() => import("../component/user/booking/index")));
const BookingDate = Loadable(lazy(() => import("../component/user/booking/book/index")));
const Profile = Loadable(lazy(() => import("../component/user/header/SocialProfile/SocialProfile")));
const EVInputUser = Loadable(lazy(() => import("../component/user/evs")));
const PaymentUser = Loadable(lazy(() => import("../component/user/payment")));
const PaymentQr = Loadable(lazy(() => import("../component/user/payment/QRCode/test")));
const ChargingEV = Loadable(lazy(() => import("../component/user/charge/index")));
const MyCoins = Loadable(lazy(() => import("../component/user/historypay/pay")));
const PayCoins = Loadable(lazy(() => import("../component/user/money/index")));
const IntroCar = Loadable(lazy(() => import("../component/user/car/intro")));
const AddCar = Loadable(lazy(() => import("../component/user/car/create")));
const Map = Loadable(lazy(() => import("../component/user/map")));
const AllNews = Loadable(lazy(() => import("../component/user/new/all")));
const News = Loadable(lazy(() => import("../component/user/new/event")));
const AfterPayment = Loadable(lazy(() => import("../component/user/payment/after")));

// ===== Admin Pages =====
const Admin = Loadable(lazy(() => import("../page/admin/main/index")));
const MainLayout = Loadable(lazy(() => import("../component/admin/MainLayout")));
const EV = Loadable(lazy(() => import("../page/admin/ev/EV")));
const Employees = Loadable(lazy(() => import("../page/admin/employee/Employees")));
const Customers = Loadable(lazy(() => import("../page/admin/customer/Customers")));
const Calendar = Loadable(lazy(() => import("../page/admin/calendar/Calendar")));
const Editor = Loadable(lazy(() => import("../page/Editor/Editor")));
const Create_Editor = Loadable(lazy(() => import("../page/Editor/create")));
const Edit_Editor = Loadable(lazy(() => import("../page/Editor/edit")));
const Payment = Loadable(lazy(() => import("../page/admin/pyment/Payment")));
const New = Loadable(lazy(() => import("../page/admin/New/New")));
const Create_New = Loadable(lazy(() => import("../page/admin/New/create")));
const Edit_New = Loadable(lazy(() => import("../page/admin/New/edit")));
const ProfileAdmin = Loadable(lazy(() => import("../page/SocialProfile/SocialProfile")));
const Car = Loadable(lazy(() => import("../page/admin/car/index")));
const CarData = Loadable(lazy(() => import("../page/admin/car/car_data")));
const ServiceManage = Loadable(lazy(() => import("../page/admin/servicess/index")));
const Solar = Loadable(lazy(() => import("../page/admin/mornitor/solar/solar")));
const BeforeSolar = Loadable(lazy(() => import("../page/admin/mornitor/solar/before_solar")));
const EVCabinet = Loadable(lazy(() => import("../page/admin/mornitor/cabinet/ev")));
const BeforeEVCabinet = Loadable(lazy(() => import("../page/admin/mornitor/cabinet/before_ev")));

// ======================= ROUTES =======================

const UserRoutes = (): RouteObject[] => [
  { path: "/", element: <User /> },
  {
    path: "/user",
    children: [
      { index: true, element: <User /> },
      { path: "profile", element: <Profile /> },
      { path: "evs-selector", element: <EVInputUser /> },
      { path: "payment", element: <PaymentUser /> },
      { path: "payment-by-qrcode", element: <PaymentQr /> },
      { path: "charging", element: <ChargingEV /> },
      { path: "my-coins", element: <MyCoins /> },
      { path: "add-coins", element: <PayCoins /> },
      { path: "intro-cars", element: <IntroCar /> },
      { path: "add-cars", element: <AddCar /> },
      { path: "map", element: <Map /> },
      { path: "all-news", element: <AllNews /> },
      { path: "one-news", element: <News /> },
      { path: "after-payment", element: <AfterPayment /> },
      { path: "booking-ev", element: <BookingEV /> },
      { path: "booking-date", element: <BookingDate /> },
      { path: "*", element: <User /> },
    ],
  },
];

const AdminRoutes = (roleName: string | null): RouteObject[] => {
  const isAdmin = roleName === "Admin";

  return [
    {
      path: "/admin",
      element: <MainLayout />,
      children: [
        { index: true, element: <Admin /> },
        { path: "Dashboard", element: <Admin /> },
        { path: "Payment", element: <Payment /> },
        { path: "EV Charging", element: <EV /> },
        { path: "Service", element: <ServiceManage /> },
        ...(isAdmin
          ? [
              { path: "Employees", element: <Employees /> },
              { path: "Customers", element: <Customers /> },
            ]
          : []),
        { path: "Calendar", element: <Calendar /> },
        { path: "Guide", element: <Editor /> },
        { path: "create-editor", element: <Create_Editor /> },
        { path: "edit-editor", element: <Edit_Editor /> },
        { path: "New", element: <New /> },
        { path: "create-new", element: <Create_New /> },
        { path: "edit-new", element: <Edit_New /> },
        { path: "Solar", element: <BeforeSolar /> },
        { path: "after-solar", element: <Solar /> },
        { path: "after-cabinet", element: <EVCabinet /> },
        { path: "EV Cabinet", element: <BeforeEVCabinet /> },
        { path: "profile", element: <ProfileAdmin /> },
        { path: "Car", element: <Car /> },
        { path: "Car-data", element: <CarData /> },
        { path: "*", element: <Admin /> },
      ],
    },
  ];
};

const MainRoutes = (): RouteObject[] => [
  {
    path: "/",
    children: [
      { index: true, element: <Login /> },
      { path: "/register", element: <SignUp /> },
      { path: "/loader", element: <Loader /> },
      { path: "/forgot-password", element: <ForgotPassword /> },
      { path: "/reset-password", element: <ResetPassword /> },
      { path: "*", element: <Login /> },
    ],
  },
];

// ======================= MAIN CONFIG =======================

function ConfigRoutes() {
  const [roleName, setRoleName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // โหลด role + ฟัง event login/logout
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await GetProfile();
        setRoleName(res.data.role ?? null);
      } catch {
        setRoleName(null);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();

    // 🎉 ฟัง event roleChange จาก Login & Logout
    const onRoleChange = () => fetchProfile();
    window.addEventListener("roleChange", onRoleChange);

    return () => window.removeEventListener("roleChange", onRoleChange);
  }, []);

  const loadingRoutes: RouteObject[] = [{ path: "/*", element: <Loader /> }];

  const routes = useMemo<RouteObject[]>(() => {
    if (loading) return loadingRoutes;

    if (roleName === "Admin" || roleName === "Employee") {
      return [
        { path: "/", element: <Navigate to="/admin" replace /> },
        ...AdminRoutes(roleName),
        { path: "*", element: <Navigate to="/admin" replace /> },
      ];
    }

    if (roleName === "User") {
      return [
        { path: "/", element: <Navigate to="/user" replace /> },
        ...UserRoutes(),
        { path: "*", element: <Navigate to="/user" replace /> },
      ];
    }

    return MainRoutes();
  }, [loading, roleName]);

  return useRoutes(routes);
}

export default ConfigRoutes;
