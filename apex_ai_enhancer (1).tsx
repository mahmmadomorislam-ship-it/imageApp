import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  Image as ImageIcon, 
  FileText, 
  Download, 
  Loader2, 
  RefreshCw, 
  AlertCircle, 
  File, 
  ChevronLeft, 
  ChevronRight, 
  X, 
  Crop, 
  Plus, 
  Layers, 
  Trash2, 
  Sparkles, 
  Sliders, 
  Eye, 
  Check, 
  ArrowRight,
  Info
} from 'lucide-react';
 
const PRESETS = [
  {
    name: "Pure White Isolation",
    icon: "⬜",
    text: "Transform this image into a beautiful, highly detailed 4k digital artwork masterpiece. IMPORTANT: The background MUST be pure solid white (#FFFFFF) with absolutely no other elements, shadows, or scenery. Isolate the main subject on this pure white background. Enhance lighting, colors, and resolution of the subject to make it look stunning."
  },
  {
    name: "Cinematic Studio Portrait",
    icon: "📸",
    text: "Enhance this subject into a stunning professional studio portrait. Moody volumetric cinematic lighting, shallow depth of field, sharp eyes, photorealistic 8k resolution, highly detailed skin textures, elegant clean dark studio backdrop."
  },
  {
    name: "3D Pixar Render",
    icon: "🧸",
    text: "Reimagine this image as a highly detailed, cute 3D animated character in the signature style of Disney Pixar. Smooth clay shader, vibrant playful colors, expressive large friendly eyes, beautiful cinematic lighting, soft shadows, 3D render art."
  },
  {
    name: "Dreamy Watercolor Painting",
    icon: "🎨",
    text: "Convert this image into a breathtaking watercolor masterpiece. Wet-on-wet paint texture, elegant color splashes, soft delicate brush strokes, rich artistic bleeding effects on high-quality cold-press paper background."
  },
  {
    name: "Cyberpunk Illustration",
    icon: "⚡",
    text: "Recreate this subject as a cool cyberpunk digital illustration. Electric neon glow accents (cyan, magenta, purple), futuristic cyberware or fashion, detailed technical lines, dark rainy city street background with glowing signs."
  },
  {
    name: "Line Art Sketch",
    icon: "✏️",
    text: "Redraw this image as a minimalist black ink line art illustration. Clean elegant contours, solid black ink strokes, white background, high-contrast outline sketch with minimal cross-hatching."
  }
];
 
export default function App() {
  const [error, setError] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  
  // Active pair displayed in the preview panel
  const [currentOriginal, setCurrentOriginal] = useState(null);
  const [currentEnhanced, setCurrentEnhanced] = useState(null);
  
  // Gallery contains items of shape: { id, original, enhanced, prompt, timestamp, pageNumber }
  const [gallery, setGallery] = useState([]);
  const [activePreset, setActivePreset] = useState(PRESETS[0].name);
  
  const [prompt, setPrompt] = useState(PRESETS[0].text);
  
  // Visual state
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isSliding, setIsSliding] = useState(false);
  const sliderRef = useRef(null);
 
  // PDF states
  const [pdfDoc, setPdfDoc] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [isPdfMode, setIsPdfMode] = useState(false);
  const [selection, setSelection] = useState(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  // queuedCrops stores objects: { dataUrl, pageNumber }
  const [queuedCrops, setQueuedCrops] = useState([]);
  const [batchProgress, setBatchProgress] = useState(null);
 
  const fileInputRef = useRef(null);
  const pdfInputRef = useRef(null);
  const pdfCanvasRef = useRef(null);
  const pdfContainerRef = useRef(null);
  const renderTaskRef = useRef(null);
 
  const apiKey = ""; // Provided by environment runtime
 
  const loadScript = (src) => new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
 
  // Securely load PDF.js to bypass Safari/iOS cross-origin worker blocks
  const initPdfJs = async () => {
    if (window.pdfjsLib) return;
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
    
    try {
      const workerUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const response = await fetch(workerUrl);
      const workerBlob = await response.blob();
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(workerBlob);
    } catch (err) {
      console.warn("Blob worker fallback failed. Using default URL.", err);
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
  };
 
  const generateWithRetry = async (payload, attempt = 0) => {
    const delays = [1000, 2000, 4000, 8000, 16000];
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { text: payload.prompt },
              { inlineData: { mimeType: payload.mimeType, data: payload.base64 } }
            ]
          }],
          generationConfig: {
            responseModalities: ["IMAGE"]
          }
        })
      });
 
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API Error ${response.status}: ${errText}`);
      }
      
      const result = await response.json();
      const base64Data = result.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
 
      if (!base64Data) throw new Error("No image data returned from API");
      
      return `data:image/jpeg;base64,${base64Data}`;
    } catch (error) {
      if (attempt < delays.length) {
        await new Promise(r => setTimeout(r, delays[attempt]));
        return generateWithRetry(payload, attempt + 1);
      }
      throw error;
    }
  };
 
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
 
    setError(null);
    setIsGenerating(true);
 
    try {
      const reader = new FileReader();
      const fileData = await new Promise((resolve, reject) => {
        reader.onload = (ev) => resolve(ev.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      
      setCurrentOriginal(fileData);
      setCurrentEnhanced(null);
      
      const base64 = fileData.split(',')[1];
      const mimeType = fileData.match(/data:(.*?);/)[1] || "image/jpeg";
 
      const payload = {
        prompt: prompt.trim() || "Enhance this image.",
        base64,
        mimeType
      };
 
      const generatedImgUrl = await generateWithRetry(payload);
      
      setCurrentEnhanced(generatedImgUrl);
      setSliderPosition(50);
 
      const newHistoryItem = {
        id: Date.now(),
        original: fileData,
        enhanced: generatedImgUrl,
        prompt: prompt,
        pageNumber: null,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setGallery(prev => [newHistoryItem, ...prev]);
    } catch (err) {
      console.error(err);
      setError(`Generation failed: ${err.message}. Please try again.`);
    } finally {
      setIsGenerating(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };
 
  const handlePdfUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
 
    setError(null);
    setIsLoadingPdf(true);
    
    try {
      await initPdfJs();
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      setPdfDoc(pdf);
      setTotalPages(pdf.numPages);
      setCurrentPage(1);
      setIsPdfMode(true);
      setSelection(null);
    } catch (err) {
      console.error("PDF load error:", err);
      setError("Failed to load PDF. Please ensure it is a valid document.");
    } finally {
      setIsLoadingPdf(false);
      if (pdfInputRef.current) pdfInputRef.current.value = '';
    }
  };
 
  const renderPdfPage = async (pageNum) => {
    if (!pdfDoc || !pdfCanvasRef.current) return;
    
    try {
      if (renderTaskRef.current) {
        await renderTaskRef.current.cancel();
      }
 
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = pdfCanvasRef.current;
      const context = canvas.getContext('2d');
      
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      
      const renderContext = { canvasContext: context, viewport };
      const renderTask = page.render(renderContext);
      
      renderTaskRef.current = renderTask;
      await renderTask.promise;
    } catch (err) {
      if (err.name !== 'RenderingCancelledException') {
        console.error("Page render error:", err);
      }
    } finally {
      renderTaskRef.current = null;
    }
  };
 
  useEffect(() => {
    if (isPdfMode && pdfDoc) {
      renderPdfPage(currentPage);
      setSelection(null); 
    }
  }, [currentPage, isPdfMode, pdfDoc]);
 
  const getCoordinates = (e, rect) => {
    if (e.touches && e.touches.length > 0) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    }
    return {
      x: (e.clientX || 0) - rect.left,
      y: (e.clientY || 0) - rect.top
    };
  };
 
  const handlePointerDown = (e) => {
    if (!pdfContainerRef.current) return;
    const rect = pdfContainerRef.current.getBoundingClientRect();
    const { x, y } = getCoordinates(e, rect);
    setStartPos({ x, y });
    setIsSelecting(true);
    setSelection(null);
  };
 
  const handlePointerMove = (e) => {
    if (!isSelecting || !pdfContainerRef.current) return;
    if (e.cancelable) e.preventDefault(); 
 
    const rect = pdfContainerRef.current.getBoundingClientRect();
    const { x: clientX, y: clientY } = getCoordinates(e, rect);
    
    const currentX = Math.max(0, Math.min(clientX, rect.width));
    const currentY = Math.max(0, Math.min(clientY, rect.height));
    
    setSelection({
      left: Math.min(startPos.x, currentX),
      top: Math.min(startPos.y, currentY),
      width: Math.abs(currentX - startPos.x),
      height: Math.abs(currentY - startPos.y)
    });
  };
 
  const handlePointerUp = () => {
    setIsSelecting(false);
  };
 
  const getCropDataUrl = () => {
    const canvas = pdfCanvasRef.current;
    const rect = pdfContainerRef.current.getBoundingClientRect();
    
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
 
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = selection.width * scaleX;
    cropCanvas.height = selection.height * scaleY;
    const ctx = cropCanvas.getContext('2d');
 
    ctx.drawImage(
      canvas,
      selection.left * scaleX, selection.top * scaleY, selection.width * scaleX, selection.height * scaleY,
      0, 0, cropCanvas.width, cropCanvas.height
    );
 
    return cropCanvas.toDataURL('image/jpeg', 0.95);
  };
 
  const handleAddToQueue = () => {
    if (!selection || !pdfCanvasRef.current || !pdfContainerRef.current) return;
    const base64DataUrl = getCropDataUrl();
    setQueuedCrops(prev => [...prev, { dataUrl: base64DataUrl, pageNumber: currentPage }]);
    setSelection(null); 
  };
 
  const handleRemoveFromQueue = (index) => {
    setQueuedCrops(prev => prev.filter((_, i) => i !== index));
  };
 
  const handleProcessQueue = async () => {
    if (queuedCrops.length === 0) return;
    setIsGenerating(true);
    setError(null);
    setIsPdfMode(false); 
    
    try {
      const cropsToProcess = [...queuedCrops];
      for (let i = 0; i < cropsToProcess.length; i++) {
        setBatchProgress({ current: i + 1, total: cropsToProcess.length });
        
        const cropItem = cropsToProcess[i];
        const base64 = cropItem.dataUrl.split(',')[1];
        const payload = {
          prompt: prompt.trim() || "Enhance this image.",
          base64,
          mimeType: "image/jpeg"
        };
 
        setCurrentOriginal(cropItem.dataUrl);
        setCurrentEnhanced(null);
        
        const generatedImgUrl = await generateWithRetry(payload);
        
        setCurrentEnhanced(generatedImgUrl);
        setSliderPosition(50);
 
        const newHistoryItem = {
          id: Date.now() + i,
          original: cropItem.dataUrl,
          enhanced: generatedImgUrl,
          prompt: prompt,
          pageNumber: cropItem.pageNumber,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setGallery(prev => [newHistoryItem, ...prev]);
      }
      setQueuedCrops([]); 
    } catch (err) {
      console.error("Batch processing error:", err);
      setError(`Batch generation failed on image ${batchProgress?.current || 1}: ${err.message}. Please try again.`);
    } finally {
      setIsGenerating(false);
      setBatchProgress(null);
    }
  };
 
  const handleCropAndEnhance = async () => {
    if (!selection || !pdfCanvasRef.current || !pdfContainerRef.current) return;
    
    const base64DataUrl = getCropDataUrl();
    const sourcePage = currentPage;
    setSelection(null); 
    setIsGenerating(true);
    setError(null);
    setIsPdfMode(false); 
 
    try {
      setCurrentOriginal(base64DataUrl);
      setCurrentEnhanced(null);
 
      const base64 = base64DataUrl.split(',')[1];
      const payload = {
        prompt: prompt.trim() || "Enhance this image.",
        base64,
        mimeType: "image/jpeg"
      };
 
      const generatedImgUrl = await generateWithRetry(payload);
      
      setCurrentEnhanced(generatedImgUrl);
      setSliderPosition(50);
 
      const newHistoryItem = {
        id: Date.now(),
        original: base64DataUrl,
        enhanced: generatedImgUrl,
        prompt: prompt,
        pageNumber: sourcePage,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setGallery(prev => [newHistoryItem, ...prev]);
    } catch (err) {
      console.error(err);
      setError(`Generation failed: ${err.message}. Please try again.`);
    } finally {
      setIsGenerating(false);
    }
  };
 
  const handleExportWord = async () => {
    if (gallery.length === 0) return;
    setError(null);
    
    try {
      await loadScript('https://unpkg.com/docx@7.8.2/build/index.js');
      const { Document, Packer, Paragraph, ImageRun, AlignmentType, TextRun } = window.docx;
 
      const children = [];
      const chronologicalGallery = [...gallery].reverse(); 
 
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 600 },
        children: [
          new TextRun({
            text: "AI Enhanced Masterpieces Gallery",
            bold: true,
            size: 48,
            color: "312E81",
          })
        ]
      }));
 
      for (const item of chronologicalGallery) {
        const img = new Image();
        img.src = item.enhanced;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = () => reject(new Error("Failed to load image for Word export"));
        });
        
        let width = 500;
        let height = (img.height * width) / img.width;
 
        let arrayBuffer;
        try {
          const response = await fetch(item.enhanced);
          arrayBuffer = await response.arrayBuffer();
        } catch (fetchErr) {
          const b64 = item.enhanced.split(',')[1];
          const binaryStr = window.atob(b64);
          const bytes = new Uint8Array(binaryStr.length);
          for(let i = 0; i < binaryStr.length; i++) {
             bytes[i] = binaryStr.charCodeAt(i);
          }
          arrayBuffer = bytes.buffer;
        }

        const detailsText = item.pageNumber 
          ? `Enhancement Prompt: ${item.prompt} (Source: PDF Page ${item.pageNumber})`
          : `Enhancement Prompt: ${item.prompt}`;
 
        children.push(
          new Paragraph({
            spacing: { before: 200, after: 100 },
            children: [
              new TextRun({ text: "Details: ", bold: true, color: "4B5563" }),
              new TextRun({ text: detailsText, italic: true, color: "6B7280" })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 600 },
            children: [
              new ImageRun({
                data: arrayBuffer,
                transformation: { width, height }
              })
            ]
          })
        );
      }
 
      const doc = new Document({
        sections: [{ children }]
      });
 
      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Masterpieces_Gallery_${Date.now()}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Word export error:", err);
      setError("Failed to generate Word document: " + err.message);
    }
  };
 
  const handleDownload = () => {
    if (!currentEnhanced) return;
    const a = document.createElement('a');
    a.href = currentEnhanced;
    a.download = `Enhanced_Image_${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
 
  const handlePresetSelect = (preset) => {
    setActivePreset(preset.name);
    setPrompt(preset.text);
  };
 
  const handleSliderMove = (clientX) => {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(percentage);
  };
 
  const handleTouchMove = (e) => {
    if (e.touches.length > 0) {
      handleSliderMove(e.touches[0].clientX);
    }
  };
 
  const handleDeleteHistoryItem = (id, e) => {
    e.stopPropagation();
    setGallery(prev => prev.filter(item => item.id !== id));
  };
 
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8 font-sans antialiased selection:bg-indigo-500 selection:text-white">
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #475569; }
      `}</style>
      
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header Block */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-slate-800/60 backdrop-blur-md p-6 rounded-3xl border border-slate-700/60 shadow-xl">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-2xl shadow-lg shadow-indigo-500/25">
              <Sparkles className="w-8 h-8 text-white animate-pulse" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent">
                Apex AI Enhancer
              </h1>
              <p className="text-slate-400 text-sm mt-0.5">Perfect static images, cropped PDFs, and blueprints instantly.</p>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-3 w-full md:w-auto">
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isGenerating || isLoadingPdf}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-3 rounded-2xl font-semibold transition-all duration-200 hover:shadow-lg hover:shadow-indigo-500/10 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
            >
              {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
              <span>Upload Image</span>
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleImageUpload} 
              accept="image/*" 
              className="hidden" 
            />
 
            <button 
              onClick={() => pdfInputRef.current?.click()}
              disabled={isGenerating || isLoadingPdf}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-650 text-slate-200 px-5 py-3 rounded-2xl font-semibold transition-all duration-200 active:scale-95 disabled:opacity-50"
            >
              {isLoadingPdf ? <Loader2 className="w-5 h-5 animate-spin text-indigo-400" /> : <File className="w-5 h-5 text-indigo-400" />}
              <span>Upload PDF</span>
            </button>
            <input 
              type="file" 
              ref={pdfInputRef} 
              onChange={handlePdfUpload} 
              accept="application/pdf" 
              className="hidden" 
            />
 
            {pdfDoc && (
              <button 
                onClick={() => setIsPdfMode(true)}
                disabled={isGenerating}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 px-5 py-3 rounded-2xl font-semibold transition-all duration-200"
              >
                <FileText className="w-5 h-5" />
                <span>Open PDF View</span>
              </button>
            )}
          </div>
        </header>
 
        {/* Error Notification */}
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/25 text-rose-300 p-4 rounded-2xl flex items-start gap-3 shadow-md">
            <AlertCircle className="w-5 h-5 mt-0.5 shrink-0 text-rose-400" />
            <div className="flex-1">
              <h3 className="font-semibold text-rose-200">Processing Interrupted</h3>
              <p className="text-sm text-slate-300 mt-1">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-300 p-1 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
 
        {/* Primary Interactive Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          <div className="lg:col-span-8 space-y-6">
            {/* Prompt Configurator */}
            <div className="bg-slate-800/40 border border-slate-700/60 p-6 rounded-3xl space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold tracking-wider uppercase text-indigo-400 flex items-center gap-2">
                  <Sliders className="w-4 h-4" />
                  AI Prompt & Presets
                </span>
                <span className="text-xs text-slate-500 font-medium">Customize enhancement instructions</span>
              </div>
 
              <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => handlePresetSelect(preset)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                      activePreset === preset.name
                        ? 'bg-indigo-600/15 border-indigo-500 text-indigo-300'
                        : 'bg-slate-850 border-slate-700/50 text-slate-400 hover:border-slate-600 hover:text-slate-250'
                    }`}
                  >
                    <span>{preset.icon}</span>
                    <span>{preset.name}</span>
                  </button>
                ))}
              </div>
 
              <div className="relative">
                <textarea
                  value={prompt}
                  onChange={(e) => {
                    setPrompt(e.target.value);
                    setActivePreset("");
                  }}
                  placeholder="Describe your targeted changes..."
                  className="w-full bg-slate-900/60 p-4 rounded-2xl border border-slate-750 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm leading-relaxed text-slate-200 placeholder:text-slate-500 resize-none custom-scrollbar"
                  rows="4"
                />
              </div>
            </div>
 
            {/* Split Screen / Interactive Comparison Sandbox */}
            <div className="bg-slate-800/40 border border-slate-700/60 p-6 rounded-3xl flex flex-col min-h-[500px] shadow-xl relative overflow-hidden">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-5 border-b border-slate-750 pb-4">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-indigo-400" />
                  <h2 className="text-lg font-bold text-slate-100">Live Comparative Sandbox</h2>
                </div>
                
                {currentEnhanced && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400 bg-slate-750 px-3 py-1 rounded-full flex items-center gap-1.5 border border-slate-700/50">
                      <Info className="w-3.5 h-3.5 text-indigo-400" />
                      Slide bar to compare
                    </span>
                    <button 
                      onClick={handleDownload}
                      className="flex items-center gap-2 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 px-4 py-2 rounded-xl text-sm font-semibold border border-indigo-500/20 transition-all active:scale-95"
                    >
                      <Download className="w-4 h-4" />
                      <span>Export Result</span>
                    </button>
                  </div>
                )}
              </div>
 
              <div className="flex-1 bg-slate-950/60 rounded-2xl overflow-hidden relative flex items-center justify-center min-h-[350px] border border-slate-750">
                {isGenerating ? (
                  <div className="flex flex-col items-center gap-4 text-center p-8">
                    <div className="relative">
                      <Loader2 className="w-12 h-12 animate-spin text-indigo-500" />
                      <Sparkles className="w-5 h-5 text-purple-400 absolute top-0.5 right-0.5 animate-bounce" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-semibold text-slate-200 animate-pulse text-base">
                        {batchProgress ? `Processing Batch item (${batchProgress.current}/${batchProgress.total})` : 'Refining Details...'}
                      </p>
                      <p className="text-xs text-slate-500 max-w-sm">Generating new pixel values. This takes 5-10 seconds using optimized models.</p>
                    </div>
                  </div>
                ) : currentEnhanced ? (
                  <div 
                    ref={sliderRef}
                    className="relative w-full h-full select-none cursor-ew-resize flex items-center justify-center max-h-[500px]"
                    onMouseMove={(e) => isSliding && handleSliderMove(e.clientX)}
                    onTouchMove={handleTouchMove}
                    onMouseDown={() => setIsSliding(true)}
                    onMouseUp={() => setIsSliding(false)}
                    onMouseLeave={() => setIsSliding(false)}
                    onTouchStart={() => setIsSliding(true)}
                    onTouchEnd={() => setIsSliding(false)}
                  >
                    <img 
                      src={currentEnhanced} 
                      alt="AI Enhanced" 
                      className="max-w-full max-h-[500px] object-contain pointer-events-none"
                    />
                    <div 
                      className="absolute top-0 left-0 h-full overflow-hidden flex items-center justify-center w-full"
                      style={{ clipPath: `polygon(0 0, ${sliderPosition}% 0, ${sliderPosition}% 100%, 0 100%)` }}
                    >
                      <img 
                        src={currentOriginal} 
                        alt="Original" 
                        className="max-w-full max-h-[500px] object-contain pointer-events-none"
                      />
                    </div>
                    <div 
                      className="absolute top-0 bottom-0 w-0.5 bg-indigo-500 cursor-ew-resize pointer-events-none"
                      style={{ left: `${sliderPosition}%` }}
                    >
                      <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-indigo-600 border-2 border-indigo-300 text-white flex items-center justify-center shadow-lg shadow-indigo-600/30">
                        <Sliders className="w-4 h-4 rotate-90" />
                      </div>
                    </div>
                    <span className="absolute top-4 left-4 text-xs font-semibold tracking-wide bg-slate-900/80 backdrop-blur text-indigo-300 px-3 py-1.5 rounded-lg border border-indigo-500/20">
                      Original
                    </span>
                    <span className="absolute top-4 right-4 text-xs font-semibold tracking-wide bg-slate-900/80 backdrop-blur text-purple-300 px-3 py-1.5 rounded-lg border border-purple-500/20">
                      AI Enhanced
                    </span>
                  </div>
                ) : currentOriginal ? (
                  <div className="relative w-full h-full flex flex-col items-center justify-center p-6">
                    <img src={currentOriginal} alt="Original uploaded asset" className="max-h-[400px] object-contain rounded-lg shadow-2xl" />
                    <div className="absolute bottom-4 bg-indigo-500/90 backdrop-blur text-white px-4 py-2 rounded-xl font-medium flex items-center gap-2 shadow-lg text-sm border border-indigo-400">
                      <Sparkles className="w-4 h-4" /> Ready to enhance. Click 'Upload' again or process.
                    </div>
                  </div>
                ) : (
                  <div className="text-center p-8 text-slate-500 max-w-sm">
                    <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-4 border border-slate-750">
                      <ImageIcon className="w-8 h-8 text-slate-600" />
                    </div>
                    <h3 className="font-bold text-slate-300">Workspace Vacant</h3>
                    <p className="text-sm text-slate-500 mt-1">Upload a normal image, or crop parts of a PDF blueprints to begin processing.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
 
          {/* History Sidebar */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-slate-800/40 border border-slate-700/60 p-6 rounded-3xl flex flex-col h-full lg:h-[830px] shadow-xl">
              <div className="flex items-center justify-between mb-5 border-b border-slate-750 pb-4">
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-indigo-400" />
                  <h2 className="text-lg font-bold text-slate-100">Gallery & History</h2>
                </div>
                {gallery.length > 0 && (
                  <button 
                    onClick={handleExportWord} 
                    className="flex items-center gap-1.5 bg-slate-700/50 hover:bg-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-300 border border-slate-600 transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" /> 
                    <span>Word Report</span>
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-2">
                {gallery.length === 0 ? (
                  <div className="text-center text-slate-500 flex flex-col items-center justify-center h-full pb-12">
                    <Layers className="w-12 h-12 mb-4 opacity-20" />
                    <h3 className="font-medium text-slate-400 mb-1">No History Yet</h3>
                    <p className="text-xs max-w-[200px] leading-relaxed">Your enhanced creations and queue will be logged here.</p>
                  </div>
                ) : (
                  gallery.map((item) => (
                    <div 
                      key={item.id}
                      onClick={() => {
                        setCurrentOriginal(item.original);
                        setCurrentEnhanced(item.enhanced);
                        setSliderPosition(50);
                      }}
                      className="bg-slate-900/50 p-4 rounded-2xl border border-slate-750 hover:border-indigo-500/50 hover:bg-slate-800/80 transition-all cursor-pointer group"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold tracking-wider uppercase text-slate-500">{item.timestamp}</span>
                          {item.pageNumber && (
                            <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-md font-semibold">
                              PDF Page {item.pageNumber}
                            </span>
                          )}
                        </div>
                        <button 
                          onClick={(e) => handleDeleteHistoryItem(item.id, e)} 
                          className="text-slate-500 hover:text-rose-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 h-20 mb-3">
                        <div className="relative h-full w-full rounded-lg overflow-hidden border border-slate-800 bg-slate-950">
                          <img src={item.original} className="w-full h-full object-cover" alt="History Original" />
                          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-slate-950/80 to-transparent p-1 text-[9px] font-semibold text-slate-300">Original</div>
                        </div>
                        <div className="relative h-full w-full rounded-lg overflow-hidden border border-slate-800 bg-slate-950">
                          <img src={item.enhanced} className="w-full h-full object-cover" alt="History Enhanced" />
                          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-slate-950/80 to-transparent p-1 text-[9px] font-semibold text-indigo-300">Enhanced</div>
                        </div>
                      </div>
                      <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed bg-slate-950/50 p-2 rounded-lg border border-slate-800/50">
                        {item.prompt}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* PDF Modal Engine */}
      {isPdfMode && pdfDoc && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col md:p-8">
          <div className="flex-1 w-full max-w-7xl mx-auto flex flex-col bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl overflow-hidden">
            
            <div className="flex justify-between items-center bg-slate-800 p-4 border-b border-slate-700 shadow-sm z-10 shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-emerald-500/20 p-2 rounded-lg text-emerald-400">
                  <Crop className="w-5 h-5"/>
                </div>
                <div>
                  <h3 className="font-bold text-slate-100 leading-none">PDF Extraction Studio</h3>
                  <span className="text-xs text-slate-400">Drag to crop regions for enhancement</span>
                </div>
              </div>
              <button 
                onClick={() => setIsPdfMode(false)} 
                className="bg-slate-700/50 text-slate-300 hover:text-white p-2.5 rounded-xl hover:bg-rose-500/80 transition-colors"
              >
                <X className="w-5 h-5"/>
              </button>
            </div>

            <div className="flex-1 overflow-auto bg-slate-950/80 p-4 md:p-8 flex justify-center items-start custom-scrollbar relative">
              <div 
                ref={pdfContainerRef}
                className="relative cursor-crosshair touch-none shadow-2xl ring-1 ring-slate-800 max-w-full"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
              >
                <canvas 
                  ref={pdfCanvasRef} 
                  className="max-w-full bg-white block" 
                />
                
                {selection && (
                  <div 
                    className="absolute border-2 border-indigo-500 bg-indigo-500/20 pointer-events-none z-10 backdrop-blur-[1px]"
                    style={{ 
                      left: selection.left, 
                      top: selection.top, 
                      width: selection.width, 
                      height: selection.height 
                    }} 
                  >
                    <div className="absolute -top-6 left-0 bg-indigo-500 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-sm">
                      {Math.round(selection.width)} × {Math.round(selection.height)}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-slate-800 p-4 border-t border-slate-700 flex flex-col lg:flex-row gap-6 items-center justify-between shrink-0 z-10">
              <div className="flex items-center gap-4 bg-slate-900/50 px-4 py-2 rounded-xl border border-slate-700 w-full lg:w-auto justify-center">
                <button 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                  disabled={currentPage === 1} 
                  className="p-1.5 bg-slate-700 text-slate-300 hover:text-white hover:bg-slate-600 rounded-lg disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="w-5 h-5"/>
                </button>
                <span className="text-sm font-semibold text-slate-300 w-32 text-center">
                  Page {currentPage} of {totalPages}
                </span>
                <button 
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                  disabled={currentPage === totalPages} 
                  className="p-1.5 bg-slate-700 text-slate-300 hover:text-white hover:bg-slate-600 rounded-lg disabled:opacity-30 transition-colors"
                >
                  <ChevronRight className="w-5 h-5"/>
                </button>
              </div>

              <div className="flex flex-col md:flex-row items-center gap-4 w-full lg:w-auto overflow-x-auto custom-scrollbar pb-2 lg:pb-0">
                {selection && selection.width > 20 && selection.height > 20 && (
                  <div className="flex gap-2 shrink-0">
                    <button 
                      onClick={handleAddToQueue} 
                      className="bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-colors border border-slate-600"
                    >
                      <Plus className="w-4 h-4"/> Add to Batch
                    </button>
                    <button 
                      onClick={handleCropAndEnhance} 
                      className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-indigo-600/20"
                    >
                      <Sparkles className="w-4 h-4"/> Enhance Now
                    </button>
                  </div>
                )}
                
                {queuedCrops.length > 0 && (
                  <div className="flex items-center gap-4 border-l border-slate-700 pl-4 h-full">
                    <div className="flex gap-2.5 max-w-[250px] overflow-x-auto custom-scrollbar p-1 shrink-0">
                      {queuedCrops.map((crop, idx) => (
                        <div key={idx} className="relative shrink-0 group">
                          <div className="w-12 h-12 rounded-lg overflow-hidden border-2 border-slate-600 group-hover:border-indigo-400 transition-colors relative">
                            <img src={crop.dataUrl} className="w-full h-full object-cover bg-white" alt="Queue item" />
                            <span className="absolute bottom-0 inset-x-0 bg-slate-900/80 text-[8px] text-center text-indigo-300 font-bold">
                              p.{crop.pageNumber}
                            </span>
                          </div>
                          <button 
                            onClick={() => handleRemoveFromQueue(idx)} 
                            className="absolute -top-1.5 -right-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-full p-0.5 shadow-md transition-transform active:scale-90"
                          >
                            <X className="w-3 h-3"/>
                          </button>
                        </div>
                      ))}
                    </div>
                    <button 
                      onClick={handleProcessQueue} 
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold px-5 py-2.5 rounded-xl flex items-center gap-2 whitespace-nowrap shadow-lg shadow-emerald-600/20 shrink-0 transition-all"
                    >
                      Process All ({queuedCrops.length}) <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}