
import { useState } from "react";
import "./App.css";

async function readGeneratedText(response, setText, getChunk) {
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "Generation failed.");
  }

  if (!response.body) {
    throw new Error("This browser does not support streamed responses.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let text = "";

  function appendLine(line) {
    if (!line.trim()) return;

    const event = JSON.parse(line);
    if (event.error) throw new Error(event.error);

    const chunk = getChunk(event);
    if (chunk) {
      text += chunk;
      setText(text);
    }
  }

  while (true) {
    const { done, value } = await reader.read();
    pending += decoder.decode(value, { stream: !done });

    const lines = pending.split("\n");
    pending = lines.pop() || "";
    lines.forEach(appendLine);

    if (done) break;
  }

  appendLine(pending);
  return text;
}

function App() {
  const [student, setStudent] = useState("");
  const [teacher, setTeacher] = useState("");
  const [grade, setGrade] = useState("Grade 1");
  const [subject, setSubject] = useState("Math");
  const [topic, setTopic] = useState("");
  const [strengths, setStrengths] = useState("");
  const [challenges, setChallenges] = useState("");
  const [nextSteps, setNextSteps] = useState("");
  const [report, setReport] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadedImages, setUploadedImages] = useState([]);
  const [analysisResult, setAnalysisResult] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [outputType, setOutputType] = useState("both");
  const [activeSection, setActiveSection] = useState("dashboard");

  async function generateReport() {
  if (!student.trim()) {
    alert("Please enter the student's name.");
    return;
  }

  if (!topic.trim() || (!strengths.trim() && !challenges.trim())) {
    alert("Please enter the topic and at least one observation.");
    return;
  }

  setLoading(true);
  setReport("");

  try {
    const response = await fetch("http://127.0.0.1:8000/generate-report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        student,
        teacher,
        grade,
        subject,
        topic,
        strengths,
        challenges,
        next_steps: nextSteps,
      }),
    });

    await readGeneratedText(response, setReport, (event) => event.response || "");
  } catch (error) {
    console.error(error);
    alert(
      "Could not generate the report. Check that Ollama and your backend are running."
    );
  } finally {
    setLoading(false);
  }
}

function handleImageUpload(event) {
  const files = Array.from(event.target.files || []);
  const imageFiles = files.filter((file) =>
    file.type.startsWith("image/")
  );

  const newImages = imageFiles.map((file) => ({
    id: `${file.name}-${file.lastModified}-${Math.random()}`,
    file,
    preview: URL.createObjectURL(file),
  }));

  setUploadedImages((current) => [...current, ...newImages]);

  event.target.value = "";
}

function removeImage(id) {
  setUploadedImages((current) => {
    const imageToRemove = current.find((image) => image.id === id);

    if (imageToRemove) {
      URL.revokeObjectURL(imageToRemove.preview);
    }

    return current.filter((image) => image.id !== id);
  });
}
async function analyzeWork() {
  if (uploadedImages.length === 0) {
    alert("Please upload at least one picture first.");
    return;
  }

  setAnalyzing(true);
  setAnalysisResult("");

  try {
    const formData = new FormData();

    uploadedImages.forEach((image) => {
      formData.append("images", image.file);
    });

    formData.append("grade", grade);
    formData.append("subject", subject);
    formData.append("topic", topic || "Not specified");

    const response = await fetch(
      "http://127.0.0.1:8000/analyze-work",
      {
        method: "POST",
        body: formData,
      }
    );

    await readGeneratedText(
      response,
      setAnalysisResult,
      (event) => event.message?.content || ""
    );

  } catch (error) {
    console.error("Analysis error:", error);
    alert(
      "Could not analyze the pictures. Check the backend, Ollama, and vision model."
    );
  } finally {
    setAnalyzing(false);
  }
}


  return (
    <div className="app dashboard-layout">
  <aside className="sidebar">
    <div className="sidebar-logo">
      <span>Tutor <strong>Assist</strong></span>
    </div>

    <p className="sidebar-label">WORKSPACE</p>

    <nav className="sidebar-nav">
      <button
        type="button"
        className={`nav-item ${activeSection === "dashboard" ? "active" : ""}`}
        onClick={() => setActiveSection("dashboard")}
      >
        <span>⌂</span> Home
      </button>

      
    </nav>

    
  </aside>

  <div className="dashboard-main">
      {activeSection === "dashboard" && (
  <section className="dashboard-home">
    <div className="intro">
      <p className="eyebrow">YOUR TUTORING WORKSPACE</p>
      <h1>Welcome to Tutor Assist!</h1>
      <p>What would you like to work on today?</p>
    </div>

    <div className="dashboard-cards">
      <button
        className="dashboard-card"
        onClick={() => setActiveSection("reports")}
      >
        <strong>Progress Reports</strong>
        <span> Create parent-friendly student updates.</span>
        <span className="dashboard-card-link"> Open reports →</span>
      </button>

      <button
        className="dashboard-card"
        onClick={() => setActiveSection("analyze")}
      >
        <strong>Analyze Work</strong>
        <span> Upload tests and worksheets.</span>
        <span className="dashboard-card-link"> Analyze work →</span>
      </button>

      <button
        className="dashboard-card"
        onClick={() => setActiveSection("worksheets")}
      >
        <strong>Worksheets</strong>
        <span> Prepare practice activities.</span>
        <span className="dashboard-card-link"> Open worksheets →</span>
      </button>

      <button
        className="dashboard-card"
        onClick={() => setActiveSection("students")}
      >
        <strong>Students</strong>
        <span> Organize your tutoring workspace.</span>
        <span className="dashboard-card-link"> View students →</span>
      </button>
    </div>
  </section>
)}

{activeSection === "reports" && (
      <main className="container">
        
        <section className="form-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">SESSION WORKSPACE</p>
              <h2>Student progress notes</h2>
            </div>
          </div>

          <div className="form-grid">
            <label>
              Student name
              <input
                value={student}
                onChange={(e) => setStudent(e.target.value)}
                placeholder="e.g. Alex"
              />
            </label>

            <label>
              Teacher's Name
              <input
                value={teacher}
                onChange={(e) => setTeacher(e.target.value)}
                placeholder="e.g. Ms. Johnson"
              />
            </label>

            <label>
              Grade level
              <select value={grade} onChange={(e) => setGrade(e.target.value)}>
                <option>Kindergarten</option>
                <option>Grade 1</option>
                <option>Grade 2</option>
                <option>Grade 3</option>
                <option>Grade 4</option>
                <option>Grade 5</option>
                <option>Grade 6</option>
                <option>Grade 7</option>
                <option>Grade 8</option>
                <option>Grade 9</option>
                <option>Grade 10</option>
                <option>Grade 11</option>
                <option>Grade 12</option>
              </select>
            </label>

            <label>
              Subject
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              >
                <option>Math</option>
                <option>English</option>
                <option>Science</option>
                <option>French</option>
                <option>Other</option>
              </select>
            </label>

            <label>
              Topic covered
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Equivalent fractions"
              />
            </label>

            <label className="full-width">
              What did the student do well?
              <textarea
                value={strengths}
                onChange={(e) => setStrengths(e.target.value)}
                placeholder="Describe what you observed during the session..."
                rows={3}
              />
            </label>

            <label className="full-width">
              What needs more practice?
              <textarea
                value={challenges}
                onChange={(e) => setChallenges(e.target.value)}
                placeholder="What was difficult? Include specific examples..."
                rows={3}
              />
            </label>

            <label className="full-width">
              Recommended next steps
              <textarea
                value={nextSteps}
                onChange={(e) => setNextSteps(e.target.value)}
                placeholder="What should you review or practice for next time?"
                rows={2}
              />
            </label>
          </div>
        

        <button
          className="generate-button"
          onClick={generateReport}
          disabled={loading}
        >
          {loading ? "Generating report..." : "Prepare progress report"}
          {!loading && <span>→</span>}
        </button>

        {report && (
          <section className="report-result">
            <p className="eyebrow">YOUR GENERATED REPORT</p>
            <h2>Student progress update</h2>
            <div className="report-text">{report}</div>
            <button
              className="copy-button"
              onClick={() => navigator.clipboard.writeText(report)}
          >
            Copy report
          </button>
        </section>
      )}

          </section>
      </main>
    )}

{activeSection === "analyze" && (
  <main className="container">
    <section className="form-card">
      <div className="card-heading">
        <div>
          <p className="eyebrow">STUDENT WORKSPACE</p>
          <h2>Analyze student work</h2>
          <p>Upload student work and choose what you want to create.</p>
        </div>
      </div>
      <section className="upload-section">
  <div className="card-heading">
    <h2>Upload student work</h2>
    <p>
      Add recent tests, quizzes, or worksheets to personalize
      the learning recommendations.
    </p>
  </div>

  <label className="upload-zone" htmlFor="student-work-images">
    <span className="upload-icon">＋</span>
    <strong>Choose pictures to upload </strong>
    <span>Click here to browse files on your computer </span>
    <span className="upload-formats">JPG, PNG, WEBP</span>
  </label>

  <input
    id="student-work-images"
    className="image-file-input"
    type="file"
    accept="image/*"
    multiple
    onChange={handleImageUpload}
  />

  {uploadedImages.length > 0 && (
    <div className="image-preview-grid">
      {uploadedImages.map((image) => (
        <div className="image-preview-card" key={image.id}>
          <img src={image.preview} alt={image.file.name} />

          <div className="image-preview-info">
            <span title={image.file.name}>
              {image.file.name}
            </span>

            <button
              type="button"
              className="remove-image-button"
              onClick={() => removeImage(image.id)}
              aria-label={`Remove ${image.file.name}`}
            >
              Remove
            </button>
          </div>
        </div>
      ))}
    </div>
  )}

  <div className="output-options">
    <h3>What would you like to generate?</h3>

    <label className={`output-option ${outputType === "report" ? "selected" : ""}`}>
      <input
        type="radio"
        name="outputType"
        value="report"
        checked={outputType === "report"}
        onChange={(event) => setOutputType(event.target.value)}
      />
      <span>
        <strong>Progress report </strong>
        <small>A parent-friendly learning update</small>
      </span>
    </label>

    <label className={`output-option ${outputType === "worksheet" ? "selected" : ""}`}>
      <input
        type="radio"
        name="outputType"
        value="worksheet"
        checked={outputType === "worksheet"}
        onChange={(event) => setOutputType(event.target.value)}
      />
      <span>
        <strong>Practice worksheet </strong>
        <small>New questions targeting areas to practise</small>
      </span>
    </label>

    <label className={`output-option ${outputType === "both" ? "selected" : ""}`}>
      <input
        type="radio"
        name="outputType"
        value="both"
        checked={outputType === "both"}
        onChange={(event) => setOutputType(event.target.value)}
      />
      <span>
        <strong>Both </strong>
        <small>A progress report and a personalized worksheet</small>
      </span>
    </label>
  </div>
</section>
<button
  type="button"
  className="generate-button"
  onClick={analyzeWork}
  disabled={analyzing || uploadedImages.length === 0}
>
  {analyzing ? "Analyzing student work..." : "Analyze uploaded work"}
  {!analyzing && <span>→</span>}
</button>

{analysisResult && (
  <section className="report-result">
    <p className="eyebrow">AI ANALYSIS</p>
    <h2>Student work feedback</h2>

    <div
      className="report-text"
      style={{ whiteSpace: "pre-wrap" }}
    >
      {analysisResult}
    </div>

    <button
      type="button"
      className="copy-button"
      onClick={() =>
        navigator.clipboard.writeText(analysisResult)
      }
    >
      Copy analysis
    </button>
  </section>
)}

    </section>
  </main>
)}

{activeSection === "worksheets" && (
  <main className="container">
    <section className="form-card">
      <p className="eyebrow">PRACTICE MATERIALS</p>
      <h2>Worksheet Generator</h2>
      <p>We'll build your personalized worksheet generator here.</p>
    </section>
  </main>
)}

{activeSection === "students" && (
        <main className="container">
          <section className="form-card">
            <p className="eyebrow">STUDENT MANAGEMENT</p>
            <h2>Students</h2>
            <p>Your student list and progress history will go here.</p>
          </section>
        </main>
)}

      <footer>
        Tutor Assist · Built for tutors, focused on student growth.
      </footer>
    </div>
  </div>
  );
}

export default App;
