'use client';

import { useState, useEffect } from 'react';

interface LipsyncGeneratorProps {
    characterSlug: string;
    characterName: string;
    avatarUrl?: string;
    generatedVideos?: { url: string, text: string }[];
    setGeneratedVideos?: React.Dispatch<React.SetStateAction<{ url: string, text: string }[]>>;
}

export default function LipsyncGenerator({
    characterSlug,
    characterName,
    avatarUrl,
    generatedVideos: propVideos,
    setGeneratedVideos: propSetVideos
}: LipsyncGeneratorProps) {
    const [text, setText] = useState('');
    const [referenceImage, setReferenceImage] = useState(avatarUrl || '');
    const [resolution, setResolution] = useState('512');
    const [uploadedVoicePath, setUploadedVoicePath] = useState<string | null>(null);
    const [uploadedVoiceName, setUploadedVoiceName] = useState<string | null>(null);

    // Voice Selector State
    const [availableVoices, setAvailableVoices] = useState<{ name: string, description: string }[]>([]);
    const [selectedPresetVoice, setSelectedPresetVoice] = useState<string>('');

    const [isUploading, setIsUploading] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);

    // Internal state fallback if props are not provided
    const [internalVideos, setInternalVideos] = useState<{ url: string, text: string }[]>([]);

    // Use props if available, otherwise internal state
    const generatedVideos = propVideos || internalVideos;
    const setGeneratedVideos = propSetVideos || setInternalVideos;

    // Check localStorage for image sent from Library
    useEffect(() => {
        const storedImage = localStorage.getItem('lipsyncInputImage');
        if (storedImage) {
            setReferenceImage(storedImage);
            // Clear it so it doesn't auto-populate again
            localStorage.removeItem('lipsyncInputImage');
        }
    }, []);

    // Load available voices
    useEffect(() => {
        fetch('/api/voxcpm/voices')
            .then(res => res.json())
            .then(data => {
                if (data.success && data.voices) {
                    setAvailableVoices(data.voices);
                }
            })
            .catch(err => console.error('Failed to load voices:', err));
    }, []);

    const processVoiceFile = async (file: File) => {
        setIsUploading(true);
        try {
            // 1. Upload for storage
            const formData = new FormData();
            formData.append('file', file);
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            const data = await res.json();

            if (data.success) {
                setUploadedVoicePath(data.filepath);
                setUploadedVoiceName(file.name);

                // 2. Auto-transcribe
                const transFormData = new FormData();
                transFormData.append('audio', file);
                const transRes = await fetch('/api/voxcpm/transcribe', { method: 'POST', body: transFormData });
                const transData = await transRes.json();

                if (transData.success && transData.transcript) {
                    setText(transData.transcript);
                }
            } else {
                alert('Upload failed: ' + data.error);
            }
        } catch (err) {
            console.error(err);
            alert('Upload/Transcribe failed');
        } finally {
            setIsUploading(false);
        }
    };

    const handleVoiceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processVoiceFile(file);
    };

    const handleVoiceDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith('audio/')) {
            processVoiceFile(file);
        }
    };
    const [generationProgress, setGenerationProgress] = useState(0);
    const [previewVideo, setPreviewVideo] = useState<string | null>(null);

    const handleGenerate = async () => {
        if (!text.trim()) {
            alert('Please enter text for the character to say');
            return;
        }

        if (!referenceImage) {
            alert('Please provide a reference image (avatar)');
            return;
        }

        setIsGenerating(true);
        setGenerationProgress(10);

        try {
            // Step 1: Generate Audio with VoxCPM
            setGenerationProgress(20);
            const audioRes = await fetch('/api/voxcpm/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text,
                    characterName,
                    voicePath: uploadedVoicePath || (selectedPresetVoice ? `voices/${selectedPresetVoice}` : undefined),
                }),
            });

            const audioData = await audioRes.json();
            if (!audioData.success) {
                throw new Error('Audio generation failed: ' + audioData.error);
            }

            setGenerationProgress(50);

            // Step 2: Generate Lipsync Video with ComfyUI
            const videoRes = await fetch('/api/comfyui/animate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    characterSlug,
                    referenceImage,
                    audioUrl: audioData.audioUrl,
                    resolution,
                }),
            });

            const videoData = await videoRes.json();
            if (!videoData.success) {
                throw new Error('Video generation failed: ' + videoData.error);
            }

            setGenerationProgress(80);

            setGenerationProgress(80);

            // Poll for completion
            // Backend returns prompt_id, ensure we handle that
            const pid = videoData.promptId || videoData.prompt_id;
            if (!pid) {
                throw new Error("No prompt ID received from backend");
            }
            await pollForVideoCompletion(pid);

        } catch (e: any) {
            console.error('Lipsync generation error:', e);
            alert('Failed to generate lipsync video: ' + e.message);
            setIsGenerating(false);
            setGenerationProgress(0);
        }
    };

    const pollForVideoCompletion = async (promptId: string) => {
        // Increase timeout to ~10 minutes (200 * 3s = 600s)
        const maxAttempts = 200;
        let attempts = 0;

        const checkStatus = async (): Promise<void> => {
            try {
                const res = await fetch(`/api/comfyui/status/${promptId}`);
                const data = await res.json();

                if (data.status === 'done' && data.videoUrl) {
                    setGeneratedVideos(prev => [{ url: data.videoUrl, text }, ...prev]);
                    setGenerationProgress(100);
                    setTimeout(() => {
                        setIsGenerating(false);
                        setGenerationProgress(0);
                    }, 1000);
                    return;
                }

                if (data.status === 'error') {
                    throw new Error(data.error || 'Video generation failed');
                }

                // Continue polling
                attempts++;
                if (attempts < maxAttempts) {
                    // Update progress slowly from 80% to 99%
                    setGenerationProgress(Math.min(99, 80 + (attempts / maxAttempts) * 19));
                    setTimeout(checkStatus, 3000);
                } else {
                    throw new Error('Video generation timed out');
                }

            } catch (e: any) {
                console.error('Polling error:', e);
                alert('Video generation failed: ' + e.message);
                setIsGenerating(false);
                setGenerationProgress(0);
            }
        };

        setTimeout(checkStatus, 3000);
    };

    const [isPosting, setIsPosting] = useState<string | null>(null);

    const handlePostToFanvue = async (videoUrl: string, captionText: string) => {
        if (!confirm(`Post this video to Fanvue?`)) return;

        setIsPosting(videoUrl);
        try {
            const res = await fetch(`/api/characters/${characterSlug}/post`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imageUrl: videoUrl,
                    caption: captionText || "New video ✨",
                    isSubscriberOnly: false
                }),
            });
            const data = await res.json();
            if (data.success) {
                alert('Success! Video posted to Fanvue.');
            } else {
                alert('Failed to post: ' + data.error);
            }
        } catch (e) {
            alert('Failed to post to Fanvue');
        } finally {
            setIsPosting(null);
        }
    };

    const handleSaveToLibrary = async (videoUrl: string) => {
        try {
            const res = await fetch(`/api/characters/${characterSlug}/save-video`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ videoUrl }),
            });
            const data = await res.json();
            if (data.success) {
                alert('Video saved to library!');
            } else {
                alert('Failed to save: ' + data.error);
            }
        } catch (e) {
            alert('Failed to save video');
        }
    };

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', height: '100%' }}>
            {/* Left Panel - Controls */}
            <div style={{
                padding: '24px',
                background: 'rgba(255,255,255,0.02)',
                borderRadius: '16px',
                border: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px'
            }}>
                <div>
                    <h3 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px' }}>
                        🎬 Lipsync Video Generator
                    </h3>
                    <p style={{ fontSize: '13px', color: '#666' }}>
                        Create talking head videos for {characterName} using VoxCPM + ComfyUI
                    </p>
                </div>

                {/* Reference Image */}
                <div>
                    <label style={{ display: 'block', fontSize: '13px', marginBottom: '8px', color: '#ccc', fontWeight: '600' }}>
                        Reference Image
                    </label>
                    <input
                        value={referenceImage}
                        onChange={e => setReferenceImage(e.target.value)}
                        placeholder="https://... or use avatar"
                        disabled={isGenerating}
                        style={{
                            width: '100%',
                            padding: '12px',
                            background: 'black',
                            border: '1px solid #333',
                            color: 'white',
                            borderRadius: '8px',
                            marginBottom: '8px'
                        }}
                    />
                    {referenceImage && (
                        <div style={{
                            width: '100%',
                            height: '200px',
                            background: '#111',
                            borderRadius: '8px',
                            overflow: 'hidden',
                            border: '1px solid #333'
                        }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={referenceImage}
                                alt="Reference"
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'contain'
                                }}
                            />
                        </div>
                    )}
                    <p style={{ fontSize: '11px', color: '#666', marginTop: '6px' }}>
                        💡 Use your character's avatar or any generated image
                    </p>
                </div>

                {/* Voice Upload */}
                {/* Voice Selection */}
                <div>
                    <label style={{ display: 'block', fontSize: '13px', marginBottom: '8px', color: '#ccc', fontWeight: '600' }}>
                        Voice Reference (Optional)
                    </label>

                    {/* Preset Voice Dropdown */}
                    <select
                        value={selectedPresetVoice}
                        onChange={(e) => {
                            setSelectedPresetVoice(e.target.value);
                            if (e.target.value) {
                                // Clear custom upload if selecting preset
                                setUploadedVoicePath(null);
                                setUploadedVoiceName(null);
                            }
                        }}
                        disabled={isGenerating || !!uploadedVoiceName}
                        style={{
                            width: '100%',
                            padding: '12px',
                            background: 'black',
                            border: '1px solid #333',
                            color: 'white',
                            borderRadius: '8px',
                            marginBottom: '12px',
                            cursor: uploadedVoiceName ? 'not-allowed' : 'pointer',
                            opacity: uploadedVoiceName ? 0.5 : 1
                        }}
                    >
                        <option value="">-- Use Default / Auto Voice --</option>
                        {availableVoices.map(voice => (
                            <option key={voice.name} value={voice.name}>
                                {voice.name} - {voice.description}
                            </option>
                        ))}
                    </select>

                    <div style={{
                        textAlign: 'center',
                        margin: '12px 0',
                        fontSize: '11px',
                        color: '#666',
                        fontWeight: '600',
                        textTransform: 'uppercase',
                        letterSpacing: '1px'
                    }}>
                        OR UPLOAD CUSTOM
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={handleVoiceDrop}
                            style={{
                                flex: 1,
                                cursor: selectedPresetVoice ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '10px',
                                border: '1px dashed #444',
                                borderRadius: '8px',
                                background: 'rgba(255,255,255,0.05)',
                                color: '#888',
                                fontSize: '12px',
                                transition: 'all 0.2s',
                                width: '100%',
                                opacity: selectedPresetVoice ? 0.5 : 1
                            }}>
                            <input
                                type="file"
                                accept="audio/*"
                                onChange={handleVoiceUpload}
                                style={{ display: 'none' }}
                                disabled={isUploading || !!selectedPresetVoice}
                            />
                            {isUploading ? '⏳ Uploading & Transcribing...' : (uploadedVoiceName || '📁 Drag & Drop or Click to Upload...')}
                        </label>
                        {uploadedVoiceName && (
                            <button
                                onClick={() => {
                                    setUploadedVoicePath(null);
                                    setUploadedVoiceName(null);
                                }}
                                style={{
                                    padding: '10px',
                                    background: '#333',
                                    border: 'none',
                                    borderRadius: '6px',
                                    color: '#f87171',
                                    cursor: 'pointer'
                                }}
                                title="Clear voice"
                            >
                                ✕
                            </button>
                        )}
                    </div>
                </div>

                {/* Resolution Selector */}
                <div>
                    <label style={{ display: 'block', fontSize: '13px', marginBottom: '8px', color: '#ccc', fontWeight: '600' }}>
                        Resolution
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {['256', '512', '768'].map(res => (
                            <button
                                key={res}
                                onClick={() => setResolution(res)}
                                style={{
                                    flex: 1,
                                    padding: '8px',
                                    background: resolution === res ? '#f59e0b' : 'rgba(255,255,255,0.1)',
                                    border: '1px solid ' + (resolution === res ? '#f59e0b' : '#333'),
                                    color: 'white',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    fontWeight: resolution === res ? 'bold' : 'normal',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {res}x{res}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Text to speak */}
                <div>
                    <label style={{ display: 'block', fontSize: '13px', marginBottom: '8px', color: '#ccc', fontWeight: '600' }}>
                        Text to Speak
                    </label>
                    <textarea
                        value={text}
                        onChange={e => setText(e.target.value)}
                        placeholder={`What do you want ${characterName} to say?`}
                        rows={8}
                        disabled={isGenerating}
                        style={{
                            width: '100%',
                            padding: '12px',
                            background: 'black',
                            border: '1px solid #333',
                            color: 'white',
                            borderRadius: '8px',
                            resize: 'vertical',
                            fontFamily: 'inherit'
                        }}
                    />
                    <p style={{ fontSize: '11px', color: '#666', marginTop: '6px' }}>
                        ⏱️ Keep it under 30 seconds for best results
                    </p>
                </div>

                {/* Progress Indicator */}
                {isGenerating && (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <span style={{ fontSize: '13px', color: '#a78bfa', fontWeight: '600' }}>
                                {generationProgress < 50 ? '🎤 Generating Audio...' :
                                    generationProgress < 80 ? '🎬 Creating Video...' :
                                        '✨ Finalizing...'}
                            </span>
                            <span style={{ fontSize: '12px', color: '#888' }}>
                                {Math.round(generationProgress)}%
                            </span>
                        </div>
                        <div style={{
                            width: '100%',
                            height: '8px',
                            background: '#222',
                            borderRadius: '4px',
                            overflow: 'hidden',
                            border: '1px solid #333'
                        }}>
                            <div style={{
                                width: `${generationProgress}%`,
                                height: '100%',
                                background: 'linear-gradient(90deg, #f59e0b 0%, #ef4444 100%)',
                                transition: 'width 0.3s ease',
                                boxShadow: generationProgress > 0 ? '0 0 10px rgba(245, 158, 11, 0.5)' : 'none'
                            }} />
                        </div>
                    </div>
                )}

                {/* Generate Button */}
                <button
                    onClick={handleGenerate}
                    disabled={isGenerating || !referenceImage}
                    style={{
                        padding: '14px 24px',
                        background: isGenerating || !referenceImage ? '#444' : 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: isGenerating || !referenceImage ? 'not-allowed' : 'pointer',
                        fontWeight: '600',
                        fontSize: '15px',
                        opacity: isGenerating || !referenceImage ? 0.6 : 1,
                        transition: 'all 0.2s'
                    }}
                >
                    {isGenerating ? '⏳ Generating...' : '🎬 Generate Lipsync Video'}
                </button>

                {!referenceImage && (
                    <p style={{ fontSize: '12px', color: '#f87171', textAlign: 'center' }}>
                        ⚠️ Please provide a reference image first
                    </p>
                )}
            </div>

            {/* Right Panel - Generated Videos */}
            <div style={{
                padding: '24px',
                background: 'rgba(255,255,255,0.02)',
                borderRadius: '16px',
                border: '1px solid rgba(255,255,255,0.1)',
                overflowY: 'auto',
                maxHeight: '700px'
            }}>
                <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>
                    Generated Videos ({generatedVideos.length})
                </h3>

                {generatedVideos.length === 0 ? (
                    <div style={{
                        padding: '60px 20px',
                        textAlign: 'center',
                        color: '#666',
                        border: '2px dashed #333',
                        borderRadius: '12px'
                    }}>
                        <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎥</div>
                        <p>Your generated videos will appear here</p>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gap: '16px' }}>
                        {generatedVideos.map((video, idx) => (
                            <div
                                key={idx}
                                style={{
                                    position: 'relative',
                                    background: '#111',
                                    borderRadius: '12px',
                                    overflow: 'hidden',
                                    border: '1px solid #333'
                                }}
                            >
                                <video
                                    src={video.url}
                                    controls
                                    style={{
                                        width: '100%',
                                        display: 'block',
                                        maxHeight: '300px'
                                    }}
                                    onClick={() => setPreviewVideo(video.url)}
                                />
                                <div style={{
                                    padding: '12px',
                                    background: 'rgba(0,0,0,0.8)'
                                }}>
                                    <p style={{
                                        fontSize: '12px',
                                        color: '#999',
                                        marginBottom: '8px',
                                        fontStyle: 'italic'
                                    }}>
                                        &quot;{video.text.substring(0, 60)}{video.text.length > 60 ? '...' : ''}&quot;
                                    </p>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            onClick={() => handleSaveToLibrary(video.url)}
                                            style={{
                                                flex: 1,
                                                padding: '8px 12px',
                                                background: '#6366f1',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                fontSize: '13px',
                                                fontWeight: '600'
                                            }}
                                        >
                                            💾 Save to Library
                                        </button>
                                        <button
                                            onClick={() => handlePostToFanvue(video.url, video.text)}
                                            disabled={isPosting === video.url}
                                            style={{
                                                padding: '8px 12px',
                                                background: '#0ea5e9',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '6px',
                                                cursor: isPosting === video.url ? 'not-allowed' : 'pointer',
                                                fontSize: '13px',
                                                fontWeight: '600',
                                                opacity: isPosting === video.url ? 0.7 : 1
                                            }}
                                        >
                                            {isPosting === video.url ? '⏳...' : '🚀 Post'}
                                        </button>
                                        <a
                                            href={video.url}
                                            download
                                            style={{
                                                padding: '8px 12px',
                                                background: '#333',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                fontSize: '13px',
                                                fontWeight: '600',
                                                textDecoration: 'none',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}
                                        >
                                            ⬇️
                                        </a>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Video Preview Modal */}
            {previewVideo && (
                <div
                    onClick={() => setPreviewVideo(null)}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        background: 'rgba(0,0,0,0.95)',
                        zIndex: 2000,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer'
                    }}
                >
                    <video
                        src={previewVideo}
                        controls
                        autoPlay
                        style={{
                            maxWidth: '90vw',
                            maxHeight: '90vh',
                            borderRadius: '8px',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.8)'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}
        </div>
    );
}
