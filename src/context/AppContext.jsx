import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import api from "../api/api";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import debounce from "lodash.debounce";

const AppContext = createContext(undefined);

export function AppContextProvider({ children }) {
  const navigate = useNavigate();

  // =========================
  // Auth States
  // =========================
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);

  // =========================
  // Project States
  // =========================
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [activeProject, setActiveProject] = useState(null);
  const [loadingActiveProject, setLoadingActiveProject] = useState(true);

  const [chatLoading, setChatLoading] = useState(false);
  const [generatingProject, setGeneratingProject] = useState(false);

  const [activeFile, setActiveFile] = useState("/App.js");
  const [showCode, setShowCode] = useState(false);

  // =========================
  // Check Auth Session
  // =========================
  const checkSession = useCallback(async () => {
    try {
      const { data } = await api.get("/api/auth/me");
      setUser(data.user);
    } catch (error) {
      setUser(null);
    } finally {
      setLoadingUser(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // =========================
  // Login
  // =========================
  const login = useCallback(
    async (email, password) => {
      try {
        const { data } = await api.post("/api/auth/login", {
          email,
          password,
        });

        setUser(data.user);
        toast.success("Welcome back!");
        navigate("/");
      } catch (err) {
        console.error("Login failed:", err);

        const errMsg =
          err?.response?.data?.error || "Invalid email or password";

        toast.error(errMsg);
        throw new Error(errMsg);
      }
    },
    [navigate],
  );

  // =========================
  // Register
  // =========================
  const register = useCallback(
    async (name, email, password) => {
      try {
        const { data } = await api.post("/api/auth/register", {
          name,
          email,
          password,
        });

        setUser(data.user);
        toast.success("Account created successfully!");
        navigate("/");
      } catch (err) {
        console.error("Registration failed:", err);

        const errMsg = err?.response?.data?.error || "Registration failed";

        toast.error(errMsg);
        throw new Error(errMsg);
      }
    },
    [navigate],
  );

  // =========================
  // Logout
  // =========================
  const logout = useCallback(async () => {
    try {
      await api.post("/api/auth/logout");

      setUser(null);
      setProjects([]);
      setActiveProject(null);

      toast.success("Logged out successfully");
      navigate("/login");
    } catch (err) {
      console.error("Logout failed:", err);
      toast.error("Logout failed");
    }
  }, [navigate]);

  // =========================
  // Load All Projects
  // =========================
  const loadProjects = useCallback(async () => {
    if (!user) return;

    setLoadingProjects(true);

    try {
      const { data } = await api.get("/api/projects");
      setProjects(data);
    } catch (err) {
      console.error("Failed to list projects:", err);
      toast.error("Failed to load projects list");
    } finally {
      setLoadingProjects(false);
    }
  }, [user]);

  // =========================
  // Load Single Project
  // =========================
  const loadProject = useCallback(
    async (id, silent = false) => {
      if (!user) return;

      if (!silent) {
        setLoadingActiveProject(true);
      }

      try {
        const { data } = await api.get(`/api/projects/${id}`);

        setActiveProject(data);

        // Default file selection
        const files = Object.keys(data.files || {});

        if (files.length > 0) {
          setActiveFile((prev) => {
            if (files.includes(prev)) {
              return prev;
            }

            if (files.includes("/App.js")) {
              return "/App.js";
            }

            return files[0];
          });
        }
      } catch (err) {
        console.error("Failed to load project:", err);

        if (!silent) {
          toast.error("Failed to load project details");
          navigate("/");
        }
      } finally {
        if (!silent) {
          setLoadingActiveProject(false);
        }
      }
    },
    [user, navigate],
  );

  // =========================
  // Poll Active Project
  // =========================
  useEffect(() => {
    if (!activeProject?._id || !user) {
      return;
    }

    const isOngoing =
      activeProject.status === "generating" ||
      activeProject.status === "pending" ||
      activeProject.status === "revising";

    if (!isOngoing) {
      setChatLoading(false);
      return;
    }

    setChatLoading(true);

    const interval = setInterval(() => {
      loadProject(activeProject._id, true);
    }, 2000);

    return () => {
      clearInterval(interval);
    };
  }, [activeProject?._id, activeProject?.status, user, loadProject]);

  // =========================
  // Generate Project
  // =========================
  const handleGenerate = useCallback(
    async (prompt) => {
      if (!user) return;

      setGeneratingProject(true);

      try {
        const { data } = await api.post("/api/projects", {
          prompt,
        });

        toast.success("AI Agent is planning structure...");

        navigate(`/builder/${data._id}`);
      } catch (err) {
        console.error("Failed to generate project:", err);

        toast.error(err?.response?.data?.error || "Failed to generate project");
      } finally {
        setGeneratingProject(false);
      }
    },
    [navigate, user],
  );

  // =========================
  // Delete Project
  // =========================
  const handleDelete = useCallback(
    async (id) => {
      if (!user) return;

      try {
        await api.delete(`/api/projects/${id}`);

        setProjects((prev) => prev.filter((project) => project._id !== id));

        // If currently opened project is deleted
        if (activeProject?._id === id) {
          setActiveProject(null);
        }

        toast.success("Project deleted successfully");

        navigate("/");
      } catch (err) {
        console.error("Failed to delete project:", err);

        toast.error("Failed to delete project");
      }
    },
    [user, activeProject, navigate],
  );

  // =========================
  // Chat / Revision
  // =========================
  const handleChat = useCallback(
    async (prompt) => {
      if (!activeProject || !user) return;

      setChatLoading(true);

      try {
        const { data } = await api.post(
          `/api/projects/${activeProject._id}/chat`,
          {
            prompt,
          },
        );

        setActiveProject(data);

        toast.success(`Updated to version ${data.version}`);
      } catch (err) {
        console.error("Revision request failed:", err);

        toast.error(err?.response?.data?.error || "Revision request failed");
      } finally {
        setChatLoading(false);
      }
    },
    [activeProject, user],
  );

  // =========================
  // Debounced Auto Save
  // =========================
  const debouncedSave = useMemo(
    () =>
      debounce(async (id, files) => {
        try {
          await api.put(`/api/projects/${id}/files`, {
            files,
          });
        } catch (err) {
          console.error("Failed to auto save files:", err);

          toast.error("Failed to save code modification");
        }
      }, 1000),
    [],
  );

  // Cancel debounce on unmount
  useEffect(() => {
    return () => {
      debouncedSave.cancel();
    };
  }, [debouncedSave]);

  // =========================
  // Update Project Files
  // =========================
  const updateProjectFiles = useCallback(
    (files) => {
      if (!activeProject || !user) return;

      debouncedSave(activeProject._id, files);
    },
    [activeProject, user, debouncedSave],
  );

  // =========================
  // Context Provider
  // =========================
  return (
    <AppContext.Provider
      value={{
        // Auth
        user,
        loadingUser,
        login,
        register,
        logout,

        // Projects
        projects,
        loadingProjects,
        activeProject,
        loadingActiveProject,

        // Loading states
        chatLoading,
        generatingProject,

        // Editor
        activeFile,
        showCode,
        setActiveFile,
        setShowCode,

        // Actions
        loadProjects,
        loadProject,
        handleGenerate,
        handleDelete,
        handleChat,
        updateProjectFiles,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

// =========================
// Custom Hook
// =========================
export function useAppContext() {
  const context = useContext(AppContext);

  if (context === undefined) {
    throw new Error("useAppContext must be used within an AppContextProvider");
  }

  return context;
}
