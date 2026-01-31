import axios from "axios";

const api = axios.create({
  baseURL:"http://localhost:5000/api"
});

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem("token");
      window.location = "/login";
    }
    return Promise.reject(err);
  }
);

export default api;
