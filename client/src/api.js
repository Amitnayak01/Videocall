import axios from "axios";

const api = axios.create({
  baseURL:"https://video-call-961n.onrender.com/api"
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
