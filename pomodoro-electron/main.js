const { app, BrowserWindow, ipcMain, nativeTheme, Tray, Menu, nativeImage } = require('electron');
const path = require('path');

let mainWindow;
let tray = null;
let nowPlaying;

// Platform-specific Now Playing module
if (process.platform === 'darwin') {
    try {
        nowPlaying = require('./native/nowplaying-mac');
    } catch (e) {
        console.log('macOS nowplaying module not available:', e.message);
    }
} else if (process.platform === 'win32') {
    try {
        nowPlaying = require('./native/nowplaying-win');
    } catch (e) {
        console.log('Windows nowplaying module not available:', e.message);
    }
}

// Create 1-bit tomato icon (16x16 pixel art)
function createTrayIcon(isDark = false) {
    const color = isDark ? '#FFFFFF' : '#000000';
    const size = 16;
    const scale = 2; // @2x for retina

    // SVG template for 1-bit pixel tomato
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size * scale}" height="${size * scale}" viewBox="0 0 16 16">
        <style>rect{fill:${color}}</style>
        <!-- Stem -->
        <rect x="7" y="0" width="2" height="1"/>
        <!-- Leaf -->
        <rect x="5" y="1" width="6" height="1"/>
        <!-- Body -->
        <rect x="4" y="2" width="8" height="1"/>
        <rect x="3" y="3" width="10" height="1"/>
        <rect x="2" y="4" width="12" height="1"/>
        <rect x="2" y="5" width="12" height="1"/>
        <rect x="1" y="6" width="14" height="1"/>
        <rect x="1" y="7" width="14" height="1"/>
        <rect x="1" y="8" width="14" height="1"/>
        <rect x="1" y="9" width="14" height="1"/>
        <rect x="2" y="10" width="12" height="1"/>
        <rect x="2" y="11" width="12" height="1"/>
        <rect x="3" y="12" width="10" height="1"/>
        <rect x="4" y="13" width="8" height="1"/>
        <rect x="5" y="14" width="6" height="1"/>
        <rect x="6" y="15" width="4" height="1"/>
    </svg>`;

    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    const image = nativeImage.createFromDataURL(dataUrl);

    // Mark as template for macOS (system will handle dark/light automatically)
    if (process.platform === 'darwin') {
        image.setTemplateImage(true);
    }

    return image;
}

// Create app icon (larger, for dock/taskbar)
function createAppIcon() {
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 16 16">
        <style>rect{fill:#000000}</style>
        <!-- Stem -->
        <rect x="7" y="0" width="2" height="1"/>
        <!-- Leaf -->
        <rect x="5" y="1" width="6" height="1"/>
        <!-- Body -->
        <rect x="4" y="2" width="8" height="1"/>
        <rect x="3" y="3" width="10" height="1"/>
        <rect x="2" y="4" width="12" height="1"/>
        <rect x="2" y="5" width="12" height="1"/>
        <rect x="1" y="6" width="14" height="1"/>
        <rect x="1" y="7" width="14" height="1"/>
        <rect x="1" y="8" width="14" height="1"/>
        <rect x="1" y="9" width="14" height="1"/>
        <rect x="2" y="10" width="12" height="1"/>
        <rect x="2" y="11" width="12" height="1"/>
        <rect x="3" y="12" width="10" height="1"/>
        <rect x="4" y="13" width="8" height="1"/>
        <rect x="5" y="14" width="6" height="1"/>
        <rect x="6" y="15" width="4" height="1"/>
    </svg>`;

    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    return nativeImage.createFromDataURL(dataUrl);
}

function createTray() {
    const icon = createTrayIcon(nativeTheme.shouldUseDarkColors);
    tray = new Tray(icon);

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show Pomodoro',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                }
            }
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click: () => {
                app.quit();
            }
        }
    ]);

    tray.setToolTip('Pomodoro Timer');
    tray.setContextMenu(contextMenu);

    // Click to show window
    tray.on('click', () => {
        if (mainWindow) {
            if (mainWindow.isVisible()) {
                mainWindow.hide();
            } else {
                mainWindow.show();
                mainWindow.focus();
            }
        }
    });

    // Update tray icon when theme changes
    nativeTheme.on('updated', () => {
        const newIcon = createTrayIcon(nativeTheme.shouldUseDarkColors);
        tray.setImage(newIcon);
    });
}

function createWindow() {
    const appIcon = createAppIcon();

    mainWindow = new BrowserWindow({
        width: 420,
        height: 850,
        minWidth: 380,
        minHeight: 600,
        icon: appIcon,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 15, y: 15 },
        backgroundColor: nativeTheme.shouldUseDarkColors ? '#000000' : '#ffffff',
        show: false
    });

    mainWindow.loadFile('renderer/index.html');

    // Show window when ready to prevent flash
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Handle window close - hide to tray instead of quitting
    mainWindow.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Update background color when theme changes
    nativeTheme.on('updated', () => {
        if (mainWindow) {
            mainWindow.setBackgroundColor(
                nativeTheme.shouldUseDarkColors ? '#000000' : '#ffffff'
            );
        }
    });
}

// IPC Handlers for Now Playing
ipcMain.handle('get-now-playing', async () => {
    if (!nowPlaying) return null;
    try {
        return await nowPlaying.getCurrentTrack();
    } catch (e) {
        console.error('Error getting now playing:', e);
        return null;
    }
});

ipcMain.handle('media-control', async (event, action) => {
    if (!nowPlaying) return false;
    try {
        await nowPlaying.control(action);
        return true;
    } catch (e) {
        console.error('Error controlling media:', e);
        return false;
    }
});

ipcMain.handle('is-music-available', () => {
    return !!nowPlaying;
});

// IPC Handler for theme
ipcMain.handle('get-system-theme', () => {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
});

// App lifecycle
app.whenReady().then(() => {
    // Set dock icon for macOS
    if (process.platform === 'darwin' && app.dock) {
        const dockIcon = createAppIcon();
        app.dock.setIcon(dockIcon);
    }

    createWindow();
    createTray();

    app.on('activate', () => {
        if (mainWindow) {
            mainWindow.show();
        } else if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('before-quit', () => {
    app.isQuitting = true;
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
