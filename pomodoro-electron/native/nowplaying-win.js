/**
 * Windows Now Playing integration using Windows.Media.Control API
 *
 * Prerequisites:
 * npm install @aspect-build/aspect-rules-js (for NodeRT bindings)
 * or use winrt-related package
 *
 * Note: This module requires Windows 10 1809+ and NodeRT bindings
 * The actual implementation depends on the available NodeRT package
 */

let media = null;
let isAvailable = false;

// Try to load Windows Media Control module
try {
    // Try different NodeRT packages
    try {
        media = require('@aspect-build/aspect-rules-js/windows.media.control');
    } catch {
        try {
            media = require('windows.media.control');
        } catch {
            console.warn('Windows Media Control module not available');
        }
    }
    isAvailable = !!media;
} catch (e) {
    console.warn('Failed to load Windows Media Control:', e.message);
}

// Helper to convert Windows stream to base64
async function streamToBase64(thumbnail) {
    if (!thumbnail) return null;

    try {
        const { Buffer } = require('buffer');
        const stream = await thumbnail.openReadAsync();
        const size = stream.size;
        const reader = new media.DataReader(stream);
        await reader.loadAsync(size);
        const bytes = new Uint8Array(size);
        reader.readBytes(bytes);
        return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
    } catch {
        return null;
    }
}

module.exports = {
    async getCurrentTrack() {
        if (!isAvailable) return null;

        try {
            const GlobalSystemMediaTransportControlsSessionManager =
                media.GlobalSystemMediaTransportControlsSessionManager;

            const manager = await GlobalSystemMediaTransportControlsSessionManager.requestAsync();
            const session = manager.getCurrentSession();

            if (!session) return null;

            const info = await session.tryGetMediaPropertiesAsync();

            // Try to get thumbnail
            let artwork = null;
            if (info.thumbnail) {
                artwork = await streamToBase64(info.thumbnail);
            }

            return {
                title: info.title || 'Unknown',
                artist: info.artist || 'Unknown',
                album: info.albumTitle || '',
                artwork
            };
        } catch (e) {
            console.error('Error getting Windows now playing:', e);
            return null;
        }
    },

    async control(action) {
        if (!isAvailable) return;

        try {
            const GlobalSystemMediaTransportControlsSessionManager =
                media.GlobalSystemMediaTransportControlsSessionManager;

            const manager = await GlobalSystemMediaTransportControlsSessionManager.requestAsync();
            const session = manager.getCurrentSession();

            if (!session) return;

            const actions = {
                play: () => session.tryPlayAsync(),
                pause: () => session.tryPauseAsync(),
                togglePlayPause: () => session.tryTogglePlayPauseAsync(),
                next: () => session.trySkipNextAsync(),
                prev: () => session.trySkipPreviousAsync()
            };

            if (actions[action]) {
                await actions[action]();
            }
        } catch (e) {
            console.error(`Error controlling Windows media (${action}):`, e);
        }
    },

    async isPlaying() {
        if (!isAvailable) return false;

        try {
            const GlobalSystemMediaTransportControlsSessionManager =
                media.GlobalSystemMediaTransportControlsSessionManager;

            const manager = await GlobalSystemMediaTransportControlsSessionManager.requestAsync();
            const session = manager.getCurrentSession();

            if (!session) return false;

            const playbackInfo = session.getPlaybackInfo();
            return playbackInfo.playbackStatus === media.GlobalSystemMediaTransportControlsSessionPlaybackStatus.playing;
        } catch {
            return false;
        }
    }
};
