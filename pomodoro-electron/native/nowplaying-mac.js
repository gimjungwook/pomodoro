/**
 * macOS Now Playing integration
 *
 * Uses AppleScript (osascript) for Apple Music - more reliable than nowplaying-cli
 * Falls back to nowplaying-cli for other apps (Spotify, etc.)
 */

const { exec } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');
const execAsync = util.promisify(exec);

// Temp file for artwork
const ARTWORK_PATH = path.join(os.tmpdir(), 'pomodoro-artwork.jpg');

/**
 * Get current track from Apple Music using AppleScript
 */
async function getAppleMusicTrack() {
    const script = `
    tell application "System Events"
        if not (exists process "Music") then
            return "NOT_RUNNING"
        end if
    end tell

    tell application "Music"
        if player state is not playing and player state is not paused then
            return "NOT_PLAYING"
        end if

        try
            set trackName to name of current track
            set trackArtist to artist of current track
            set trackAlbum to album of current track
            set isPlaying to (player state is playing)
            return trackName & "|||" & trackArtist & "|||" & trackAlbum & "|||" & isPlaying
        on error
            return "ERROR"
        end try
    end tell
    `;

    try {
        const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`);
        const result = stdout.trim();

        if (result === 'NOT_RUNNING' || result === 'NOT_PLAYING' || result === 'ERROR') {
            return null;
        }

        const [title, artist, album, isPlayingStr] = result.split('|||');
        const isPlaying = isPlayingStr === 'true';

        // Try to get artwork
        let artwork = null;
        try {
            artwork = await getAppleMusicArtwork();
        } catch (e) {
            // Artwork not available
        }

        return {
            title: title || 'Unknown',
            artist: artist || 'Unknown',
            album: album || '',
            artwork,
            isPlaying,
            source: 'apple-music'
        };
    } catch (e) {
        console.error('AppleScript error:', e.message);
        return null;
    }
}

/**
 * Get artwork from Apple Music
 */
async function getAppleMusicArtwork() {
    const script = `
    tell application "Music"
        try
            set artworkData to raw data of artwork 1 of current track
            set artworkFormat to format of artwork 1 of current track

            -- Determine file extension
            if artworkFormat is JPEG picture then
                set fileExt to ".jpg"
            else
                set fileExt to ".png"
            end if

            set filePath to "${ARTWORK_PATH}"

            -- Write to file
            set fileRef to open for access filePath with write permission
            set eof fileRef to 0
            write artworkData to fileRef
            close access fileRef

            return filePath
        on error
            return "NO_ARTWORK"
        end try
    end tell
    `;

    try {
        const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`);
        const result = stdout.trim();

        if (result === 'NO_ARTWORK' || !result) {
            return null;
        }

        // Read file and convert to base64
        if (fs.existsSync(ARTWORK_PATH)) {
            const data = fs.readFileSync(ARTWORK_PATH);
            return `data:image/jpeg;base64,${data.toString('base64')}`;
        }
    } catch (e) {
        // Artwork extraction failed
    }
    return null;
}

/**
 * Get current track from Spotify using AppleScript
 */
async function getSpotifyTrack() {
    const script = `
    tell application "System Events"
        if not (exists process "Spotify") then
            return "NOT_RUNNING"
        end if
    end tell

    tell application "Spotify"
        if player state is not playing and player state is not paused then
            return "NOT_PLAYING"
        end if

        try
            set trackName to name of current track
            set trackArtist to artist of current track
            set trackAlbum to album of current track
            set artworkUrl to artwork url of current track
            set isPlaying to (player state is playing)
            return trackName & "|||" & trackArtist & "|||" & trackAlbum & "|||" & artworkUrl & "|||" & isPlaying
        on error
            return "ERROR"
        end try
    end tell
    `;

    try {
        const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`);
        const result = stdout.trim();

        if (result === 'NOT_RUNNING' || result === 'NOT_PLAYING' || result === 'ERROR') {
            return null;
        }

        const [title, artist, album, artworkUrl, isPlayingStr] = result.split('|||');
        const isPlaying = isPlayingStr === 'true';

        return {
            title: title || 'Unknown',
            artist: artist || 'Unknown',
            album: album || '',
            artwork: artworkUrl || null,
            isPlaying,
            source: 'spotify'
        };
    } catch (e) {
        return null;
    }
}

/**
 * Control Apple Music
 */
async function controlAppleMusic(action) {
    const commands = {
        play: 'play',
        pause: 'pause',
        togglePlayPause: 'playpause',
        next: 'next track',
        prev: 'previous track'
    };

    const cmd = commands[action];
    if (!cmd) return;

    try {
        await execAsync(`osascript -e 'tell application "Music" to ${cmd}'`);
    } catch (e) {
        console.error('Control error:', e.message);
    }
}

/**
 * Control Spotify
 */
async function controlSpotify(action) {
    const commands = {
        play: 'play',
        pause: 'pause',
        togglePlayPause: 'playpause',
        next: 'next track',
        prev: 'previous track'
    };

    const cmd = commands[action];
    if (!cmd) return;

    try {
        await execAsync(`osascript -e 'tell application "Spotify" to ${cmd}'`);
    } catch (e) {
        // Spotify not running or error
    }
}

// Track which app is currently active
let lastActiveSource = null;

module.exports = {
    async getCurrentTrack() {
        // Try Apple Music first
        const appleMusicTrack = await getAppleMusicTrack();
        if (appleMusicTrack) {
            lastActiveSource = 'apple-music';
            console.log('Now Playing (Apple Music):', appleMusicTrack.title, '-', appleMusicTrack.artist);
            return appleMusicTrack;
        }

        // Try Spotify
        const spotifyTrack = await getSpotifyTrack();
        if (spotifyTrack) {
            lastActiveSource = 'spotify';
            console.log('Now Playing (Spotify):', spotifyTrack.title, '-', spotifyTrack.artist);
            return spotifyTrack;
        }

        lastActiveSource = null;
        return null;
    },

    async control(action) {
        // Control based on last active source
        if (lastActiveSource === 'spotify') {
            await controlSpotify(action);
        } else {
            // Default to Apple Music
            await controlAppleMusic(action);
        }

        // Also try to control both if no active source
        if (!lastActiveSource) {
            await controlAppleMusic(action);
            await controlSpotify(action);
        }
    },

    async isPlaying() {
        const track = await this.getCurrentTrack();
        return !!track;
    }
};
