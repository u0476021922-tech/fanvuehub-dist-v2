'use client';

import { useState } from 'react';
import { useComfyProgress } from '@/hooks/useComfyProgress';

interface ImageGeneratorProps {
    characterSlug: string;
    characterName: string;
    loraPath?: string;
    appearance?: string;
    generatedImages: string[];
    setGeneratedImages: (images: string[] | ((prev: string[]) => string[])) => void;
}

export default function ImageGenerator({
    characterSlug,
    characterName,
    loraPath,
    appearance,
    generatedImages,
    setGeneratedImages
}: ImageGeneratorProps) {
    const [prompt, setPrompt] = useState('');
    const [negativePrompt, setNegativePrompt] = useState('ugly, deformed, blurry, low quality');
    const [numImages, setNumImages] = useState(1);
    const [previewImage, setPreviewImage] = useState<string | null>(null);

    // TikTok Integration States
    const [platform, setPlatform] = useState<'fanvue' | 'tiktok'>('fanvue');
    const [hookType, setHookType] = useState('Direct Eye Contact');
    const [faceProminence, setFaceProminence] = useState(40);


    const { state: progressState, startMonitoring, reset: resetProgress } = useComfyProgress();

    const handleGenerate = async () => {
        if (!prompt.trim()) {
            alert('Please enter a prompt');
            return;
        }

        if (!loraPath) {
            alert('No LoRA configured for this character. Please set it in Settings.');
            return;
        }

        try {
            // Start generation
            const res = await fetch(`/api/comfyui/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    characterSlug,
                    prompt: `${appearance ? appearance + ', ' : ''}${prompt}`,
                    negativePrompt,
                    numImages,
                    loraPath,
                }),
            });

            const data = await res.json();

            if (!data.success) {
                alert('Failed to start generation: ' + data.error);
                return;
            }

            // Start monitoring
            startMonitoring(data.promptId);

            // Poll for completion
            pollForCompletion(data.promptId);

        } catch (e) {
            console.error('Generation error:', e);
            alert('Failed to generate images');
        }
    };

    const pollForCompletion = async (promptId: string) => {
        const maxAttempts = 60; // 5 minutes max
        let attempts = 0;

        const checkStatus = async () => {
            try {
                const res = await fetch(`/api/comfyui/status/${promptId}`);
                const data = await res.json();

                if (data.status === 'done' && data.images && data.images.length > 0) {
                    setGeneratedImages(prev => [...data.images, ...prev]);
                    resetProgress();

                    // Clear ComfyUI memory after image generation
                    console.log('🧹 Clearing GPU memory after image generation...');
                    try {
                        await fetch('/api/comfyui/free-memory', { method: 'POST' });
                    } catch (e) {
                        console.warn('Memory clear failed (non-critical)');
                    }

                    return true;
                }

                if (data.status === 'error') {
                    alert('Generation failed: ' + data.error);
                    resetProgress();
                    return true;
                }

                // Continue polling
                attempts++;
                if (attempts < maxAttempts) {
                    setTimeout(checkStatus, 5000);
                } else {
                    alert('Generation timed out');
                    resetProgress();
                }

            } catch (e) {
                console.error('Polling error:', e);
                resetProgress();
            }
        };

        setTimeout(checkStatus, 5000);
    };

    const [isPosting, setIsPosting] = useState<string | null>(null);

    const handlePostToFanvue = async (imageUrl: string) => {
        const caption = prompt || "New generation ✨";
        if (!confirm(`Post this image to Fanvue with caption: "${caption}"?`)) return;

        setIsPosting(imageUrl);
        try {
            const res = await fetch(`/api/characters/${characterSlug}/post`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imageUrl,
                    caption,
                    isSubscriberOnly: false
                }),
            });
            const data = await res.json();
            if (data.success) {
                alert('Success! Image posted to Fanvue.');
            } else {
                alert('Failed to post: ' + data.error);
            }
        } catch (e) {
            alert('Failed to post to Fanvue');
        } finally {
            setIsPosting(null);
        }
    };

    const handleSaveToLibrary = async (imageUrl: string) => {
        try {
            const res = await fetch(`/api/characters/${characterSlug}/save-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageUrl }),
            });
            const data = await res.json();
            if (data.success) {
                alert('Image saved to library!');
            } else {
                alert('Failed to save: ' + data.error);
            }
        } catch (e) {
            alert('Failed to save image');
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
                        🎨 Text to Image Generator
                    </h3>
                    <p style={{ fontSize: '13px', color: '#666' }}>
                        Generate images for {characterName} using ComfyUI
                    </p>
                </div>

                {/* Platform Toggle */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                    <button
                        onClick={() => setPlatform('fanvue')}
                        style={{
                            flex: 1,
                            padding: '10px',
                            background: platform === 'fanvue' ? '#0ea5e9' : 'rgba(255,255,255,0.05)',
                            border: platform === 'fanvue' ? 'none' : '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '8px',
                            color: 'white',
                            fontWeight: '600',
                            fontSize: '14px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px'
                        }}
                    >
                        <span>💙</span> Fanvue
                    </button>
                    <button
                        onClick={() => setPlatform('tiktok')}
                        style={{
                            flex: 1,
                            padding: '10px',
                            background: platform === 'tiktok' ? '#fe2c55' : 'rgba(255,255,255,0.05)',
                            border: platform === 'tiktok' ? 'none' : '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '8px',
                            color: 'white',
                            fontWeight: '600',
                            fontSize: '14px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px'
                        }}
                    >
                        <span>🎵</span> TikTok
                    </button>
                </div>

                {/* TikTok Options */}
                {platform === 'tiktok' && (
                    <div style={{
                        padding: '12px',
                        marginBottom: '16px',
                        background: 'rgba(254, 44, 85, 0.05)',
                        border: '1px solid rgba(254, 44, 85, 0.2)',
                        borderRadius: '8px'
                    }}>
                        <div style={{ marginBottom: '12px' }}>
                            <label style={{ display: 'block', fontSize: '11px', color: '#ff8f9e', fontWeight: '600', marginBottom: '6px' }}>
                                HOOK TYPE (First 0.3s)
                            </label>
                            <select
                                value={hookType}
                                onChange={e => setHookType(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '8px',
                                    background: '#111',
                                    border: '1px solid #333',
                                    color: 'white',
                                    borderRadius: '6px',
                                    fontSize: '13px'
                                }}
                            >
                                <option>Direct Eye Contact (Stops Scroll)</option>
                                <option>Movement/Gesture (Breaks Filter)</option>
                                <option>Text Overlay Ready (Fresh)</option>
                                <option>Expression/Reaction (Relatable)</option>
                            </select>
                        </div>
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                <label style={{ fontSize: '11px', color: '#ff8f9e', fontWeight: '600' }}>
                                    FACE PROMINENCE
                                </label>
                                <span style={{ fontSize: '11px', color: 'white' }}>{faceProminence}%</span>
                            </div>
                            <input
                                type="range"
                                min="35"
                                max="50"
                                step="5"
                                value={faceProminence}
                                onChange={e => setFaceProminence(parseInt(e.target.value))}
                                style={{ width: '100%', accentColor: '#fe2c55' }}
                            />
                        </div>
                    </div>
                )}

                {/* Prompt */}
                <div>
                    <label style={{ display: 'block', fontSize: '13px', marginBottom: '12px', color: '#ccc', fontWeight: '600' }}>
                        Prompt
                    </label>

                    {/* Presets Grid */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)', // 3 cols for tiktok variants
                        gap: '8px',
                        marginBottom: '16px'
                    }}>
                        {(platform === 'fanvue' ? [
                            { name: '🪞 Mirror Selfie', prompt: 'Hyper-realistic mirror selfie of [NAME] in her bedroom, holding phone up capturing her reflection. She\'s wearing only a tiny oversized white t-shirt that\'s falling off one shoulder and barely covering her ass, no bra underneath - her perky breasts and hard nipples clearly visible through the thin fabric, hem riding up showing bare thighs and hint of ass cheeks. Looking at camera/phone with cute flirty smile and bedroom eyes, hair messy and sexy. Full body visible in mirror from head to mid-thigh showing her tight young body. Her face: playful seductive expression, matte skin with visible pores, natural freckles, fine peach fuzz, authentic beauty. Her exposed body: completely matte skin on bare shoulders, arms, and thighs, visible micro-pores, fine body hair on thighs catching light, natural skin texture, subtle imperfections. Soft bedroom lighting, mirror frame, raw authentic selfie aesthetic.' },
                            { name: '🚿 Shower Glass', prompt: 'Hyper-realistic photo of [NAME] pressed against frosted shower glass from inside, water running down the glass and her body. She\'s completely naked behind the semi-transparent steamy glass - her breasts, nipples, and body curves visible as silhouettes and distorted shapes through the wet foggy barrier. Face pressed close to glass looking out with sultry wet-hair sexy expression, lips slightly parted, eyes making direct contact. One hand on glass, body arched. The steamy glass obscures details but you can clearly see: breast shape pressed against glass, nipples as dark points, hip curves, pubic area as shadow, thighs. Her face clearly visible: wet hair plastered to forehead and cheeks, water droplets on face, sexy confident expression, matte skin with visible pores, natural features, authentic beauty. Her body through glass: natural female form, realistic proportions, authentic anatomy. Bathroom lighting, steam effects, raw intimate photography.' },
                            { name: '💕 Morning Stretch', prompt: 'Hyper-realistic photo of [NAME] doing a full body stretch in morning sunlight, arms raised overhead, back arched, wearing only a tiny sheer pink lace bralette (barely contains breasts, nipples visible through lace) and matching g-string panties (wedged between ass cheeks). Full body shot showing her from head to toe - face looking up/to side with eyes closed in genuine stretch expression, mouth slightly open, natural beauty. Body fully displayed: breasts lifted by arm position, flat stomach exposed, belly button visible, hip bones, thighs, long legs. Her face: morning-fresh cute expression, matte skin with pores, natural freckles, fine peach fuzz on jaw, authentic features. Her body: completely matte skin covering stomach, thighs, chest, visible micro-pores on stomach and thighs, fine body hair on arms and legs, natural skin tone variation, minor imperfections, real female body. Bright morning sunlight streaming through window, bedroom background, raw candid photography, shallow depth of field keeping both face and body in focus.' },
                            { name: '🍑 Bent Over', prompt: 'Hyper-realistic photo of [NAME] bent forward over her dresser looking back over shoulder directly at camera with mischievous cute smile. She\'s wearing only a tiny cropped tank top that\'s riding up showing underboob and entire midriff, and the tiniest bright pink thong panties wedged deep between her ass cheeks, ass completely exposed and prominent in frame. Composition shows: her beautiful face turning back with flirty expression (foreground, in focus), her arched back, bare ass with thong string visible (middle ground, in focus), and legs (background). Her face: cute playful teasing expression, direct eye contact, natural smile, matte skin with visible pores, freckles, authentic beauty. Her body: ass cheeks completely exposed with natural skin texture, visible pores on ass and thighs, fine body hair, natural flesh tone, slight cellulite texture on upper thighs (realistic), lower back dimples, stomach and underboob visible from side angle with natural skin texture. Natural bedroom lighting, intimate photography, both face and ass sharp focus.' },
                            { name: '📸 Pin-Up Pose', prompt: 'Hyper-realistic full-body portrait of [NAME] pressed back against bedroom wall, arms above head in classic pin-up pose. Wearing a completely unbuttoned white dress shirt (borrowed oversized) hanging open showing her entire front - bare breasts fully exposed with perky nipples, flat stomach, belly button, just the tiniest white g-string panties covering vulva area. Shirt falls open framing her nude torso. Looking directly at camera with confident sexy smile and bedroom eyes, chin slightly down, flirtatious expression. Full body composition head to toe showing: beautiful face with seductive expression at top, bare exposed breasts and torso in middle, legs and minimal panties at bottom. Her face: confident sexy expression, direct eye contact, natural beauty, matte skin with visible pores, freckles, fine facial hair, authentic features. Her body: full frontal view, perky breasts with natural shape, visible nipples and areolas, flat stomach with natural skin texture, visible pores on chest and stomach, fine body hair on lower stomach and thighs, natural skin tone variation, hip bones, realistic female anatomy. Soft bedroom lighting creating shadows, wall texture behind, raw boudoir photography, shallow depth of field keeping entire body in focus.' },
                            { name: '🔥 Bed Tease', prompt: 'Hyper-realistic photo of [NAME] on all fours on unmade bed, looking back at camera over shoulder with sultry inviting expression. Wearing only a tiny see-through black mesh top (breasts and nipples completely visible through mesh) and the smallest black lace thong. Full body visible from head to thighs showing: her gorgeous face looking back with bedroom eyes, her back arched sensually, breasts hanging naturally visible through sheer top, thonged ass prominent and lifted. Her face: seductive come-hither expression, direct eye contact, matte skin with visible pores, natural freckles, fine peach fuzz, authentic beauty. Her body: breasts visible through mesh with natural hang and shape, nipples showing, arched back, ass lifted with thong between cheeks, natural skin texture on entire body, visible micro-pores on back and thighs, fine body hair catching light, realistic female form. Soft bedroom lighting with shadows defining curves, messy sheets, raw intimate photography aesthetic.' },
                            { name: '👙 Bikini Reveal', prompt: 'Hyper-realistic photo of [NAME] standing playfully pulling up bikini top to expose her bare breasts while looking at camera with cute mischievous smile. Wearing the smallest string bikini in bright neon colors. Hands holding bikini top lifted just above breasts, breasts fully exposed with perky nipples, bikini bottom barely covering vulva showing hip bones and lower stomach. Full body shot head to upper thigh. Her face: cheeky playful expression, eyes sparkling with mischief, natural smile, matte skin with visible pores, freckles scattered across nose, fine facial hair, authentic features. Her body: perky exposed breasts with natural shape, visible areolas and nipples, flat toned stomach, belly button, hip bones prominent, natural skin texture covering entire torso, visible micro-pores on chest and stomach, fine body hair on lower stomach, natural skin tone variations, realistic female anatomy. Bright natural outdoor lighting, beach or pool background blurred, shallow depth of field, raw candid aesthetic.' },
                            { name: '💋 Lingerie Tease', prompt: 'Hyper-realistic close-up portrait of [NAME] sitting on edge of bed, camera angle from slightly above. Wearing only matching sheer red lace bra and panties set (both see-through showing nipples and pubic area through lace). Leaning back on hands, legs slightly spread, looking up at camera with sultry confident expression. Upper body and face prominent with lingerie-clad lower body visible. Her face: seductive bedroom eyes making direct contact, lips slightly parted, confident sexual energy, matte skin with visible pores, natural freckles, fine peach fuzz, authentic beauty. Her body: breasts in sheer bra with nipples visible through lace, cleavage, stomach, hip bones, panties showing body contours through sheer fabric, natural skin texture on all exposed areas, visible micro-pores on chest, stomach and thighs, fine body hair, natural skin tone, realistic proportions. Warm intimate bedroom lighting creating shadows and highlights, silk sheets background, professional boudoir photography aesthetic, sharp focus on face and body.' }
                        ] : [
                            // TIKTOK PRESETS (Template 1: Gaming Girl)
                            { name: '🎮 Controller Smirk', prompt: 'holding game controller, confident smirk at camera, RGB gaming lights behind, direct eye contact' },
                            { name: '🎮 Headset Shock', prompt: 'at PC desk, headset on, surprised caught expression looking at camera, gaming setup blurred background, mid-reaction energy' },
                            { name: '🎮 Mid-Stream Laugh', prompt: 'laughing at camera, hand touching chest, genuine amusement, gaming room cozy backdrop, streaming energy' },
                            { name: '🎮 Pause Game', prompt: 'leaning back in gaming chair, controller in hand, playful tilt head, seductive glance at camera, distracted energy' },
                            { name: '🎮 Setup Flex', prompt: 'showing off gaming PC with pride, hand gesturing to equipment, confident pose, RGB lights highlighting features' },
                            { name: '🎮 2AM Grind', prompt: '2AM gaming, messy hair, casual sexy vibe, tired playful expression, gaming room darker moody lighting' },
                            // TIKTOK PRESETS (Template 2: Gym Girl)
                            { name: '💪 Squat Pose', prompt: 'mid-squat form perfect, confident smirk at camera, dumbbells visible, gym mirror reflection, intense focused expression' },
                            { name: '💪 Post-Workout', prompt: 'after intense exercise, breathing hard with slight smile, sweat glistening, sports bra visible, genuine exertion energy' },
                            { name: '💪 Mirror Check', prompt: 'at gym mirror, playful confidence, hand on hip, gym attire, bright gym light, trendy aesthetic' },
                        ]).map((preset, idx) => (
                            <button
                                key={idx}
                                onClick={() => {
                                    if (platform === 'fanvue') {
                                        setPrompt(preset.prompt);
                                    } else {
                                        // TikTok Logic: Auto-append specs
                                        const hookDesc = hookType.split('(')[0].trim();
                                        const techSpecs = `vertical 9:16, face ${faceProminence}% frame, ${hookDesc}, trending aesthetic, bright lighting, high quality`;
                                        const full = `${preset.prompt}, ${techSpecs}`;
                                        setPrompt(full);
                                    }
                                }}
                                style={{
                                    padding: '8px 4px',
                                    fontSize: '11px',
                                    background: 'rgba(255,255,255,0.05)',
                                    color: '#aaa',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    textAlign: 'left'
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                                    e.currentTarget.style.color = 'white';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                                    e.currentTarget.style.color = '#aaa';
                                }}
                                title={preset.name + ': ' + preset.prompt}
                            >
                                {platform === 'tiktok' ? '🎵 ' : ''}{preset.name}
                            </button>
                        ))}
                    </div>

                    <textarea
                        value={prompt}
                        onChange={e => setPrompt(e.target.value)}
                        placeholder={`Describe the image you want to generate...${appearance ? `\n\nBase appearance: ${appearance}` : ''}`}
                        rows={6}
                        disabled={progressState.status !== 'idle'}
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
                    {appearance && (
                        <p style={{ fontSize: '11px', color: '#666', marginTop: '6px' }}>
                            💡 Your character's appearance will be automatically prepended
                        </p>
                    )}
                </div>

                {/* Negative Prompt */}
                <div>
                    <label style={{ display: 'block', fontSize: '13px', marginBottom: '8px', color: '#ccc', fontWeight: '600' }}>
                        Negative Prompt
                    </label>
                    <textarea
                        value={negativePrompt}
                        onChange={e => setNegativePrompt(e.target.value)}
                        placeholder="What to avoid in the image..."
                        rows={3}
                        disabled={progressState.status !== 'idle'}
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
                </div>

                {/* Number of Images */}
                <div>
                    <label style={{ display: 'block', fontSize: '13px', marginBottom: '8px', color: '#ccc', fontWeight: '600' }}>
                        Number of Images
                    </label>
                    <input
                        type="number"
                        min={1}
                        max={10}
                        value={numImages}
                        onChange={e => setNumImages(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                        disabled={progressState.status !== 'idle'}
                        style={{
                            width: '100%',
                            padding: '12px',
                            background: 'black',
                            border: '1px solid #333',
                            color: 'white',
                            borderRadius: '8px'
                        }}
                    />
                </div>

                {/* Progress Indicator */}
                {progressState.status !== 'idle' && (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <span style={{ fontSize: '13px', color: '#a78bfa', fontWeight: '600' }}>
                                {progressState.message}
                            </span>
                            <span style={{ fontSize: '12px', color: '#888' }}>
                                {Math.round(progressState.progress)}%
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
                                width: `${progressState.progress}%`,
                                height: '100%',
                                background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
                                transition: 'width 0.3s ease',
                                boxShadow: progressState.progress > 0 ? '0 0 10px rgba(102, 126, 234, 0.5)' : 'none'
                            }} />
                        </div>
                    </div>
                )}

                {/* Generate Button */}
                <button
                    onClick={handleGenerate}
                    disabled={progressState.status !== 'idle' || !loraPath}
                    style={{
                        padding: '14px 24px',
                        background: progressState.status !== 'idle' || !loraPath ? '#444' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: progressState.status !== 'idle' || !loraPath ? 'not-allowed' : 'pointer',
                        fontWeight: '600',
                        fontSize: '15px',
                        opacity: progressState.status !== 'idle' || !loraPath ? 0.6 : 1,
                        transition: 'all 0.2s'
                    }}
                >
                    {progressState.status !== 'idle' ? '⏳ Generating...' : '✨ Generate Images'}
                </button>

                {!loraPath && (
                    <p style={{ fontSize: '12px', color: '#f87171', textAlign: 'center' }}>
                        ⚠️ Please configure a LoRA in Settings first
                    </p>
                )}
            </div>

            {/* Right Panel - Generated Images */}
            <div style={{
                padding: '24px',
                background: 'rgba(255,255,255,0.02)',
                borderRadius: '16px',
                border: '1px solid rgba(255,255,255,0.1)',
                overflowY: 'auto',
                maxHeight: '700px'
            }}>
                <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px' }}>
                    Generated Images ({generatedImages.length})
                </h3>

                {generatedImages.length === 0 ? (
                    <div style={{
                        padding: '60px 20px',
                        textAlign: 'center',
                        color: '#666',
                        border: '2px dashed #333',
                        borderRadius: '12px'
                    }}>
                        <div style={{ fontSize: '48px', marginBottom: '12px' }}>🖼️</div>
                        <p>Your generated images will appear here</p>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gap: '16px' }}>
                        {generatedImages.map((imageUrl, idx) => (
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
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={imageUrl}
                                    alt={`Generated ${idx + 1}`}
                                    style={{
                                        width: '100%',
                                        display: 'block',
                                        cursor: 'pointer'
                                    }}
                                    onClick={() => setPreviewImage(imageUrl)}
                                />
                                <div style={{
                                    padding: '12px',
                                    display: 'flex',
                                    gap: '8px',
                                    background: 'rgba(0,0,0,0.8)'
                                }}>
                                    <button
                                        onClick={() => handleSaveToLibrary(imageUrl)}
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
                                        💾 Save
                                    </button>
                                    <button
                                        onClick={() => handlePostToFanvue(imageUrl)}
                                        disabled={isPosting === imageUrl}
                                        style={{
                                            padding: '8px 12px',
                                            background: '#0ea5e9',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '6px',
                                            cursor: isPosting === imageUrl ? 'not-allowed' : 'pointer',
                                            fontSize: '13px',
                                            fontWeight: '600',
                                            opacity: isPosting === imageUrl ? 0.7 : 1
                                        }}
                                    >
                                        {isPosting === imageUrl ? '⏳...' : '🚀 Post'}
                                    </button>

                                    {/* TikTok Schedule Button */}
                                    {platform === 'tiktok' && (
                                        <button
                                            onClick={async () => {
                                                const time = window.prompt("Schedule for (YYYY-MM-DDTHH:mm):", new Date(Date.now() + 3600000).toISOString().slice(0, 16));
                                                if (!time) return;

                                                try {
                                                    const res = await fetch('/api/tiktok/schedule', {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify({
                                                            characterSlug,
                                                            imageUrl,
                                                            caption: prompt || "New generated content ✨",
                                                            scheduledFor: time
                                                        })
                                                    });
                                                    const data = await res.json();
                                                    if (data.success) {
                                                        alert("✅ Scheduled for TikTok!");
                                                    } else {
                                                        alert("❌ Scheduling failed: " + (data.error || 'Unknown error'));
                                                    }
                                                } catch (e) {
                                                    alert("❌ Error contacting server");
                                                }
                                            }}
                                            style={{
                                                padding: '8px 12px',
                                                background: '#fe2c55',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                fontSize: '13px',
                                                fontWeight: '600'
                                            }}
                                        >
                                            📅 Schedule
                                        </button>
                                    )}

                                    <a
                                        href={imageUrl}
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
                        ))}
                    </div>
                )}
            </div>

            {/* Image Preview Modal */}
            {
                previewImage && (
                    <div
                        onClick={() => setPreviewImage(null)}
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
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={previewImage}
                            alt="Preview"
                            style={{
                                maxWidth: '90vw',
                                maxHeight: '90vh',
                                objectFit: 'contain',
                                borderRadius: '8px',
                                boxShadow: '0 20px 60px rgba(0,0,0,0.8)'
                            }}
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                )
            }
        </div >
    );
}
