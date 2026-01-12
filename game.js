// 游戏主逻辑
class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.gameState = 'start'; // start, playing, over, settings
        this.score = 0;
        this.highScore = localStorage.getItem('highScore') || 0;
        
        // 计算基于当前显示器分辨率的默认缩放比例
        const calculateDefaultScale = () => {
            // 获取屏幕高度
            const screenHeight = window.innerHeight;
            // 基于高度计算默认缩放比例
            // 1080p 及以下使用 1.0（100%）
            // 2K 分辨率使用 1.25（125%）
            // 4K 及以上使用 1.5（150%）
            if (screenHeight > 2160) return 1.5; // 4K+
            if (screenHeight > 1080) return 1.25; // 2K
            return 1.0; // 1080p 及以下
        };
        
        // 游戏设置
        this.settings = {
            keyboardSensitivity: 5,
            soundEnabled: true,
            volume: 0.5,
            controlType: 'keyboard', // keyboard 或 mouse
            interfaceScale: calculateDefaultScale() // 界面缩放比例，范围 0.75-1.5
        };
        
        // 初始化音效管理器
        this.soundManager = new SoundManager();
        this.soundManager.init();
        
        // 设置画布大小
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        
        // 游戏元素
        this.player = null;
        this.bullets = [];
        this.enemies = [];
        this.particles = [];
        
        // 游戏控制
        this.keys = {};
        this.mousePos = { x: 0, y: 0 };
        this.lastShot = 0;
        this.shotInterval = 150; // 子弹发射间隔（毫秒），减小间隔增大开火密度
        this.enemySpawnInterval = 800; // 敌人生成间隔
        this.lastEnemySpawn = 0;
        
        // 道具系统参数
        this.propSpawnScore = 100; // 每100分生成一个道具
        this.lastPropSpawnScore = 0; // 上次生成道具的分数
        this.props = []; // 道具数组
        this.propSpeed = 2; // 道具下落速度
        this.activeBuffs = []; // 激活的buff列表
        this.propNotificationTimeout = null; // 道具提示超时定时器
        this.scoreMultiplier = 1; // 分数加成倍率
        
        // 道具名称和描述映射
        this.propDescriptions = {
            rapid_fire: { name: '快速射击', description: '射击间隔减小，持续5秒' },
            shield: { name: '护盾', description: '获得防护，持续8秒' },
            score_boost: { name: '分数加成', description: '分数获取提升，持续10秒' },
            speed_boost: { name: '速度提升', description: '移动速度加快，持续6秒' }
        };
        
        // 加载设置
        this.loadSettings();
        
        // 初始化事件监听
        this.initEventListeners();
        
        // 游戏主循环
        this.gameLoop();
    }
    
    // 应用界面缩放
    applyInterfaceScale(scale) {
        // 获取所有需要缩放的UI元素
        const uiElements = [
            'gameStart',
            'gameSettings',
            'gameOver'
        ];
        
        uiElements.forEach(elementId => {
            const element = document.getElementById(elementId);
            if (element) {
                // 应用缩放，保持元素居中
                element.style.transform = `translate(-50%, -50%) scale(${scale})`;
            }
        });
        
        // 特殊处理非居中元素
        const nonCenteredElements = ['gameScore', 'activeBuffs', 'propNotification'];
        nonCenteredElements.forEach(elementId => {
            const element = document.getElementById(elementId);
            if (element) {
                // 这些元素不是居中的，只需要缩放
                element.style.transform = `scale(${scale})`;
            }
        });
    }
    
    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }
    
    initEventListeners() {
        // 键盘事件
        document.addEventListener('keydown', (e) => {
            // 将字母键转换为小写，统一处理大小写
            const key = e.key.toLowerCase();
            this.keys[key] = true;
        });
        
        document.addEventListener('keyup', (e) => {
            // 将字母键转换为小写，统一处理大小写
            const key = e.key.toLowerCase();
            this.keys[key] = false;
        });
        
        // 触摸事件 - 跟随触摸点移动模式
        let touchOffsetX = 0;
        let touchOffsetY = 0;
        let isTouching = false;
        
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (this.player) {
                isTouching = true;
                const touch = e.touches[0];
                // 计算触摸点与飞机中心的偏移量
                touchOffsetX = touch.clientX - (this.player.x + this.player.width / 2);
                touchOffsetY = touch.clientY - (this.player.y + this.player.height / 2);
            }
        });
        
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (this.player && isTouching) {
                const touch = e.touches[0];
                
                // 直接根据触摸点位置和偏移量设置飞机位置
                const targetX = touch.clientX - touchOffsetX - this.player.width / 2;
                const targetY = touch.clientY - touchOffsetY - this.player.height / 2;
                
                // 使用平滑过渡，确保移动流畅
                const smoothFactor = 0.8; // 平滑因子，值越大响应越快
                this.player.x += (targetX - this.player.x) * smoothFactor;
                this.player.y += (targetY - this.player.y) * smoothFactor;
                
                // 边界检测
                this.player.x = Math.max(0, Math.min(this.canvas.width - this.player.width, this.player.x));
                this.player.y = Math.max(0, Math.min(this.canvas.height - this.player.height, this.player.y));
            }
        });
        
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            isTouching = false;
        });
        
        this.canvas.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            isTouching = false;
        });
        
        // 鼠标移动事件 - 鼠标指针坐标控制模式
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            // 计算鼠标在画布内的精确坐标
            this.mousePos.x = e.clientX - rect.left;
            this.mousePos.y = e.clientY - rect.top;
        });
        
        // 按钮事件
        document.getElementById('startBtn').addEventListener('click', () => {
            this.startGame();
        });
        
        document.getElementById('restartBtn').addEventListener('click', () => {
            this.restartGame();
        });
        
        document.getElementById('menuBtn').addEventListener('click', () => {
            this.returnToMenu();
        });
        
        // 设置按钮事件
        document.getElementById('settingsBtn').addEventListener('click', () => {
            this.showSettings();
        });
        
        document.getElementById('backBtn').addEventListener('click', () => {
            this.hideSettings();
        });
        
        document.getElementById('saveSettingsBtn').addEventListener('click', () => {
            this.saveSettings();
            this.hideSettings();
        });
        
        // 灵敏度滑块事件
        const sensitivitySlider = document.getElementById('sensitivitySlider');
        const sensitivityValue = document.getElementById('sensitivityValue');
        
        sensitivitySlider.addEventListener('input', (e) => {
            sensitivityValue.textContent = e.target.value;
        });
        
        // 音效开关事件
        const soundToggle = document.getElementById('soundToggle');
        soundToggle.addEventListener('change', (e) => {
            this.soundManager.setMuted(!e.target.checked);
        });
        
        // 音量滑块事件
        const volumeSlider = document.getElementById('volumeSlider');
        const volumeValue = document.getElementById('volumeValue');
        
        volumeSlider.addEventListener('input', (e) => {
            const volume = parseInt(e.target.value);
            volumeValue.textContent = volume;
            this.soundManager.setVolume(volume / 100);
        });
        
        // 缩放滑块事件
        const scaleSlider = document.getElementById('scaleSlider');
        const scaleValue = document.getElementById('scaleValue');
        
        scaleSlider.addEventListener('input', (e) => {
            const scale = parseInt(e.target.value);
            scaleValue.textContent = scale;
            // 实时应用缩放
            this.applyInterfaceScale(scale / 100);
        });
    }
    
    // 加载设置
    loadSettings() {
        const savedSettings = localStorage.getItem('gameSettings');
        if (savedSettings) {
            this.settings = { ...this.settings, ...JSON.parse(savedSettings) };
        }
        
        // 更新UI
        document.getElementById('sensitivitySlider').value = this.settings.keyboardSensitivity;
        document.getElementById('sensitivityValue').textContent = this.settings.keyboardSensitivity;
        
        // 更新音效设置
        document.getElementById('soundToggle').checked = this.settings.soundEnabled;
        document.getElementById('volumeSlider').value = this.settings.volume * 100;
        document.getElementById('volumeValue').textContent = Math.round(this.settings.volume * 100);
        
        // 更新控制方式设置
        document.getElementById('controlKeyboard').checked = this.settings.controlType === 'keyboard';
        document.getElementById('controlMouse').checked = this.settings.controlType === 'mouse';
        
        // 更新缩放设置
        document.getElementById('scaleSlider').value = this.settings.interfaceScale * 100;
        document.getElementById('scaleValue').textContent = Math.round(this.settings.interfaceScale * 100);
        
        // 应用缩放
        this.applyInterfaceScale(this.settings.interfaceScale);
        
        // 更新音效管理器
        this.soundManager.setMuted(!this.settings.soundEnabled);
        this.soundManager.setVolume(this.settings.volume);
    }
    
    // 保存设置
    saveSettings() {
        const sensitivity = parseInt(document.getElementById('sensitivitySlider').value);
        const soundEnabled = document.getElementById('soundToggle').checked;
        const volume = parseInt(document.getElementById('volumeSlider').value) / 100;
        
        // 获取选中的控制方式
        const controlType = document.querySelector('input[name="controlType"]:checked').value;
        
        // 获取缩放比例
        const interfaceScale = parseInt(document.getElementById('scaleSlider').value) / 100;
        
        this.settings = {
            keyboardSensitivity: sensitivity,
            soundEnabled: soundEnabled,
            volume: volume,
            controlType: controlType,
            interfaceScale: interfaceScale
        };
        
        localStorage.setItem('gameSettings', JSON.stringify(this.settings));
        
        // 更新音效管理器
        this.soundManager.setMuted(!soundEnabled);
        this.soundManager.setVolume(volume);
    }
    
    // 显示设置界面
    showSettings() {
        this.gameState = 'settings';
        document.getElementById('gameStart').classList.add('hidden');
        document.getElementById('gameSettings').classList.remove('hidden');
    }
    
    // 隐藏设置界面
    hideSettings() {
        this.gameState = 'start';
        document.getElementById('gameSettings').classList.add('hidden');
        document.getElementById('gameStart').classList.remove('hidden');
    }
    
    // 返回菜单
    returnToMenu() {
        this.gameState = 'start';
        document.getElementById('gameOver').classList.add('hidden');
        document.getElementById('gameStart').classList.remove('hidden');
    }
    
    startGame() {
        this.gameState = 'playing';
        this.score = 0;
        this.bullets = [];
        this.enemies = [];
        this.particles = [];
        this.activeBuffs = []; // 清空激活的buff列表
        
        // 创建玩家飞机，传递灵敏度设置
        this.player = new Player(
            this.canvas.width / 2 - 25,
            this.canvas.height - 100,
            50,
            50,
            this.settings.keyboardSensitivity
        );
        
        // 隐藏开始界面
        document.getElementById('gameStart').classList.add('hidden');
        document.getElementById('gameOver').classList.add('hidden');
        
        // 重置技能提示
        // 1. 隐藏道具通知
        const propNotification = document.getElementById('propNotification');
        propNotification.classList.add('hidden');
        
        // 2. 清除道具通知定时器
        if (this.propNotificationTimeout) {
            clearTimeout(this.propNotificationTimeout);
            this.propNotificationTimeout = null;
        }
        
        // 3. 更新activeBuffs显示
        const activeBuffsContainer = document.getElementById('activeBuffs');
        activeBuffsContainer.innerHTML = '';
    }
    
    restartGame() {
        this.startGame();
    }
    
    endGame() {
        this.gameState = 'over';
        
        // 播放游戏结束音效
        this.soundManager.playGameOver();
        
        // 更新最高分
        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('highScore', this.highScore);
        }
        
        // 隐藏所有技能提示
        // 1. 隐藏道具通知
        const propNotification = document.getElementById('propNotification');
        propNotification.classList.add('hidden');
        
        // 2. 清除道具通知定时器
        if (this.propNotificationTimeout) {
            clearTimeout(this.propNotificationTimeout);
            this.propNotificationTimeout = null;
        }
        
        // 3. 清空activeBuffs数组
        this.activeBuffs = [];
        
        // 4. 更新activeBuffs显示
        const activeBuffsContainer = document.getElementById('activeBuffs');
        activeBuffsContainer.innerHTML = '';
        
        // 显示游戏结束界面
        document.getElementById('finalScore').textContent = this.score;
        document.getElementById('highScore').textContent = this.highScore;
        document.getElementById('gameOver').classList.remove('hidden');
    }
    
    spawnEnemy() {
        const now = Date.now();
        if (now - this.lastEnemySpawn > this.enemySpawnInterval) {
            const enemyType = Math.random() < 0.7 ? 'small' : Math.random() < 0.8 ? 'medium' : 'large';
            let width, height, speed, health, score;
            
            switch(enemyType) {
                case 'small':
                    width = 30;
                    height = 30;
                    speed = 3;
                    health = 1;
                    score = 10;
                    break;
                case 'medium':
                    width = 45;
                    height = 45;
                    speed = 2;
                    health = 2;
                    score = 20;
                    break;
                case 'large':
                    width = 60;
                    height = 60;
                    speed = 1;
                    health = 3;
                    score = 30;
                    break;
            }
            
            const x = Math.random() * (this.canvas.width - width);
            const enemy = new Enemy(x, -height, width, height, speed, health, score, enemyType);
            this.enemies.push(enemy);
            
            this.lastEnemySpawn = now;
        }
    }
    
    shoot() {
        const now = Date.now();
        if (now - this.lastShot > this.shotInterval) {
            const bullet = new Bullet(
                this.player.x + this.player.width / 2 - 2.5,
                this.player.y,
                5,
                15,
                8
            );
            this.bullets.push(bullet);
            this.lastShot = now;
            
            // 播放射击音效
            this.soundManager.playShoot();
        }
    }
    
    update() {
        if (this.gameState !== 'playing') return;
        
        // 更新玩家
        this.player.update(this.keys, this.mousePos, this.settings.controlType, this.canvas.width, this.canvas.height);
        
        // 发射子弹
        this.shoot();
        
        // 生成敌人
        this.spawnEnemy();
        
        // 生成道具
        this.spawnProp();
        
        // 更新子弹
        this.bullets = this.bullets.filter(bullet => {
            bullet.update();
            return bullet.y > -bullet.height;
        });
        
        // 更新敌人
        this.enemies = this.enemies.filter(enemy => {
            enemy.update();
            return enemy.y < this.canvas.height;
        });
        
        // 更新道具
        this.props = this.props.filter(prop => {
            prop.update();
            return prop.y < this.canvas.height;
        });
        
        // 更新粒子
        this.particles = this.particles.filter(particle => {
            particle.update();
            return particle.life > 0;
        });
        
        // 更新激活的buff
        this.updateBuffs();
        
        // 碰撞检测
        this.checkCollisions();
        
        // 道具碰撞检测
        this.checkPropCollisions();
        
        // 更新分数显示
        document.getElementById('currentScore').textContent = this.score;
    }
    
    // 生成道具
    spawnProp() {
        // // 游戏开始时生成一个初始道具，让玩家立即看到道具效果
        // if (this.props.length === 0 && this.score === 0) {
        //     const x = Math.random() * (this.canvas.width - 30);
        //     const prop = new Prop(x, 0, this.propSpeed);
        //     this.props.push(prop);
        // }
        
        // 当分数达到道具生成条件且尚未生成时
        const currentPropThreshold = Math.floor(this.score / this.propSpawnScore) * this.propSpawnScore;
        if (currentPropThreshold > this.lastPropSpawnScore) {
            // 随机位置生成道具
            const x = Math.random() * (this.canvas.width - 30);
            const prop = new Prop(x, 0, this.propSpeed);
            this.props.push(prop);
            this.lastPropSpawnScore = currentPropThreshold;
        }
    }
    
    // 检查道具碰撞
    checkPropCollisions() {
        for (let i = this.props.length - 1; i >= 0; i--) {
            const prop = this.props[i];
            
            if (this.isColliding(this.player, prop)) {
                // 应用道具效果
                this.applyPropEffect(prop);
                // 移除道具
                this.props.splice(i, 1);
                // 播放收集音效
                this.soundManager.playCollect();
            }
        }
    }
    
    // 应用道具效果
    applyPropEffect(prop) {
        const now = Date.now();
        const buff = {
            type: prop.type.effect,
            startTime: now,
            endTime: now + prop.type.duration
        };
        
        this.activeBuffs.push(buff);
        
        // 根据道具类型应用效果
        switch(prop.type.effect) {
            case 'rapid_fire':
                this.shotInterval = 80; // 减小射击间隔
                break;
            case 'shield':
                this.player.setShield(true); // 激活护盾
                break;
            case 'score_boost':
                this.scoreMultiplier = 2; // 分数加成，翻倍
                break;
            case 'speed_boost':
                this.player.speed *= 1.5; // 提升速度
                break;
        }
        
        // 显示道具获取提示
        this.showPropNotification(prop.type.name);
    }
    
    // 显示道具获取提示
    showPropNotification(propType) {
        const notification = document.getElementById('propNotification');
        const propName = document.querySelector('.prop-name');
        const propDesc = document.querySelector('.prop-description');
        
        // 获取道具名称和描述
        const desc = this.propDescriptions[propType];
        if (desc) {
            propName.textContent = desc.name;
            propDesc.textContent = desc.description;
        } else {
            propName.textContent = '未知道具';
            propDesc.textContent = '获得特殊效果';
        }
        
        // 清除之前的定时器
        if (this.propNotificationTimeout) {
            clearTimeout(this.propNotificationTimeout);
        }
        
        // 显示提示
        notification.classList.remove('hidden');
        
        // 设置自动隐藏定时器（4秒后隐藏）
        this.propNotificationTimeout = setTimeout(() => {
            notification.classList.add('hidden');
        }, 4000);
    }
    
    // 显示道具失效提示
    showBuffExpiredNotification(buffType) {
        const notification = document.getElementById('propNotification');
        const propName = document.querySelector('.prop-name');
        const propDesc = document.querySelector('.prop-description');
        
        // 获取道具名称
        const desc = this.propDescriptions[buffType];
        const buffName = desc ? desc.name : '未知道具';
        
        // 设置失效提示内容
        propName.textContent = buffName + ' 失效';
        propDesc.textContent = '';
        
        // 清除之前的定时器
        if (this.propNotificationTimeout) {
            clearTimeout(this.propNotificationTimeout);
        }
        
        // 显示提示
        notification.classList.remove('hidden');
        
        // 设置自动隐藏定时器（2秒后隐藏）
        this.propNotificationTimeout = setTimeout(() => {
            notification.classList.add('hidden');
        }, 2000);
    }
    
    // 更新激活的buff
    updateBuffs() {
        const now = Date.now();
        const expiredBuffs = [];
        
        this.activeBuffs = this.activeBuffs.filter(buff => {
            if (now > buff.endTime) {
                // buff过期，移除效果
                this.removeBuffEffect(buff);
                expiredBuffs.push(buff.type);
                return false;
            }
            return true;
        });
        
        // 显示失效提示
        expiredBuffs.forEach(buffType => {
            this.showBuffExpiredNotification(buffType);
        });
        
        // 更新buff显示
        this.updateActiveBuffsDisplay();
    }
    
    // 更新激活的buff显示
    updateActiveBuffsDisplay() {
        const activeBuffsContainer = document.getElementById('activeBuffs');
        const now = Date.now();
        
        // 清空容器
        activeBuffsContainer.innerHTML = '';
        
        // 为每个激活的buff创建显示元素
        this.activeBuffs.forEach(buff => {
            const buffElement = document.createElement('div');
            buffElement.className = 'buff-item';
            
            // 获取buff名称和描述
            const desc = this.propDescriptions[buff.type];
            const buffName = desc ? desc.name : '未知道具';
            
            // 计算剩余时间
            const remainingTime = Math.max(0, buff.endTime - now);
            const totalTime = buff.endTime - buff.startTime;
            const progress = (remainingTime / totalTime) * 100;
            
            // 格式化剩余时间为秒
            const remainingSeconds = Math.ceil(remainingTime / 1000);
            
            // 创建buff内容
            buffElement.innerHTML = `
                <div>
                    <div class="buff-name">${buffName}</div>
                    <div class="buff-progress">
                        <div class="buff-progress-bar" style="width: ${progress}%"></div>
                    </div>
                </div>
                <div class="buff-duration">${remainingSeconds}s</div>
            `;
            
            activeBuffsContainer.appendChild(buffElement);
        });
    }
    
    // 移除buff效果
    removeBuffEffect(buff) {
        switch(buff.type) {
            case 'rapid_fire':
                this.shotInterval = 150; // 恢复默认射击间隔
                break;
            case 'shield':
                this.player.setShield(false); // 关闭护盾
                break;
            case 'score_boost':
                this.scoreMultiplier = 1; // 恢复默认分数倍率
                break;
            case 'speed_boost':
                this.player.speed /= 1.5; // 恢复默认速度
                break;
        }
    }
    
    checkCollisions() {
        // 子弹与敌人碰撞
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const enemy = this.enemies[j];
                
                if (this.isColliding(bullet, enemy)) {
                    // 减少敌人生命值
                    enemy.health--;
                    
                    // 创建爆炸粒子
                    this.createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, enemy.type);
                    
                    // 播放爆炸音效
                    this.soundManager.playExplosion();
                    
                    // 移除子弹
                    this.bullets.splice(i, 1);
                    
                    // 如果敌人被消灭
                    if (enemy.health <= 0) {
                        // 应用分数加成
                        const finalScore = Math.round(enemy.score * this.scoreMultiplier);
                        this.score += finalScore;
                        this.enemies.splice(j, 1);
                    }
                    
                    break;
                }
            }
        }
        
        // 敌人与玩家碰撞
        for (let enemy of this.enemies) {
            if (this.isColliding(this.player, enemy)) {
                // 如果护盾激活，不结束游戏，只移除敌人和护盾
                if (this.player.shieldActive) {
                    this.createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, enemy.type);
                    this.soundManager.playExplosion();
                    
                    // 移除碰撞的敌人
                    const enemyIndex = this.enemies.indexOf(enemy);
                    if (enemyIndex > -1) {
                        this.enemies.splice(enemyIndex, 1);
                    }
                    
                    // 移除护盾效果
                    this.player.setShield(false);
                    
                    // 移除对应的buff
                    this.activeBuffs = this.activeBuffs.filter(buff => buff.type !== 'shield');
                } else {
                    // 没有护盾，结束游戏
                    this.createExplosion(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, 'player');
                    this.soundManager.playExplosion();
                    this.endGame();
                    break;
                }
            }
        }
    }
    
    isColliding(obj1, obj2) {
        return obj1.x < obj2.x + obj2.width &&
               obj1.x + obj1.width > obj2.x &&
               obj1.y < obj2.y + obj2.height &&
               obj1.y + obj1.height > obj2.y;
    }
    
    createExplosion(x, y, type) {
        const particleCount = type === 'player' ? 30 : 15;
        const colors = type === 'player' ? ['#ff6b6b', '#ff8e53', '#feca57'] : ['#48dbfb', '#0abde3', '#10ac84'];
        
        for (let i = 0; i < particleCount; i++) {
            const particle = new Particle(
                x,
                y,
                Math.random() * 4 + 2,
                Math.random() * 6 - 3,
                Math.random() * 6 - 3,
                colors[Math.floor(Math.random() * colors.length)],
                Math.random() * 30 + 20
            );
            this.particles.push(particle);
        }
    }
    
    render() {
        // 清空画布
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制星星背景
        this.drawStars();
        
        if (this.gameState === 'playing') {
            // 绘制玩家
            this.player.render(this.ctx);
            
            // 绘制子弹
            this.bullets.forEach(bullet => bullet.render(this.ctx));
            
            // 绘制敌人
            this.enemies.forEach(enemy => enemy.render(this.ctx));
            
            // 绘制道具
            this.props.forEach(prop => prop.render(this.ctx));
            
            // 绘制粒子
            this.particles.forEach(particle => particle.render(this.ctx));
        }
    }
    
    drawStars() {
        this.ctx.fillStyle = '#fff';
        for (let i = 0; i < 100; i++) {
            const x = (i * 137.5) % this.canvas.width;
            const y = (i * 277.5) % this.canvas.height;
            const size = Math.random() * 2;
            this.ctx.fillRect(x, y, size, size);
        }
    }
    
    gameLoop() {
        this.update();
        this.render();
        requestAnimationFrame(() => this.gameLoop());
    }
}

// 玩家飞机类
class Player {
    constructor(x, y, width, height, speed) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.speed = speed;
        this.shieldActive = false; // 护盾状态
    }
    
    update(keys, mousePos, controlType, canvasWidth, canvasHeight) {
        if (controlType === 'mouse') {
            // 鼠标指针坐标控制：将飞机中心精确对准鼠标指针
            this.x = mousePos.x - this.width / 2;
            this.y = mousePos.y - this.height / 2;
        } else {
            // 键盘控制
            // 检查Shift键状态，按住Shift键降低灵敏度（系数0.5）
            // 由于按键已转换为小写，需要检查小写的shift键
            const shiftPressed = keys['shift'] || keys['shiftleft'] || keys['shiftright'];
            const actualSpeed = shiftPressed ? this.speed * 0.5 : this.speed;
            
            // 键盘控制
            if (keys['ArrowLeft'] || keys['a']) {
                this.x -= actualSpeed;
            }
            if (keys['ArrowRight'] || keys['d']) {
                this.x += actualSpeed;
            }
            if (keys['ArrowUp'] || keys['w']) {
                this.y -= actualSpeed;
            }
            if (keys['ArrowDown'] || keys['s']) {
                this.y += actualSpeed;
            }
        }
        
        // 边界检测
        this.x = Math.max(0, Math.min(canvasWidth - this.width, this.x));
        this.y = Math.max(0, Math.min(canvasHeight - this.height, this.y));
    }
    
    render(ctx) {
        // 绘制护盾（如果激活）
        if (this.shieldActive) {
            ctx.strokeStyle = '#4ecdc4';
            ctx.lineWidth = 3;
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#4ecdc4';
            ctx.beginPath();
            ctx.arc(this.x + this.width / 2, this.y + this.height / 2, this.width / 2 + 10, 0, Math.PI * 2);
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
        
        // 绘制玩家飞机
        ctx.fillStyle = '#4ecdc4';
        ctx.beginPath();
        ctx.moveTo(this.x + this.width / 2, this.y);
        ctx.lineTo(this.x, this.y + this.height);
        ctx.lineTo(this.x + this.width, this.y + this.height);
        ctx.closePath();
        ctx.fill();
        
        // 绘制飞机细节
        ctx.fillStyle = '#fff';
        ctx.fillRect(this.x + this.width / 2 - 3, this.y + 10, 6, 20);
    }
    
    // 设置护盾状态
    setShield(active) {
        this.shieldActive = active;
    }
}

// 子弹类
class Bullet {
    constructor(x, y, width, height, speed) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.speed = speed;
    }
    
    update() {
        this.y -= this.speed;
    }
    
    render(ctx) {
        ctx.fillStyle = '#ff6b6b';
        ctx.fillRect(this.x, this.y, this.width, this.height);
    }
}

// 敌人飞机类
class Enemy {
    constructor(x, y, width, height, speed, health, score, type) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.speed = speed;
        this.health = health;
        this.score = score;
        this.type = type;
    }
    
    update() {
        this.y += this.speed;
    }
    
    render(ctx) {
        // 根据敌人类型绘制不同颜色
        switch(this.type) {
            case 'small':
                ctx.fillStyle = '#ff9ff3';
                break;
            case 'medium':
                ctx.fillStyle = '#f368e0';
                break;
            case 'large':
                ctx.fillStyle = '#ee5a24';
                break;
        }
        
        // 绘制敌人飞机
        ctx.fillRect(this.x, this.y, this.width, this.height);
        
        // 绘制生命值
        ctx.fillStyle = '#4ecdc4';
        const healthBarWidth = this.width * (this.health / (this.type === 'small' ? 1 : this.type === 'medium' ? 2 : 3));
        ctx.fillRect(this.x, this.y - 5, healthBarWidth, 3);
    }
}

// 粒子类（爆炸效果）
class Particle {
    constructor(x, y, size, vx, vy, color, life) {
        this.x = x;
        this.y = y;
        this.size = size;
        this.vx = vx;
        this.vy = vy;
        this.color = color;
        this.life = life;
        this.maxLife = life;
    }
    
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.1; // 重力
        this.life--;
    }
    
    render(ctx) {
        const alpha = this.life / this.maxLife;
        ctx.fillStyle = this.color.replace(')', `, ${alpha})`).replace('rgb', 'rgba');
        ctx.fillRect(this.x, this.y, this.size, this.size);
    }
}

// 道具类
class Prop {
    constructor(x, y, speed) {
        this.x = x;
        this.y = y;
        this.width = 30;
        this.height = 30;
        this.speed = speed;
        
        // 随机选择道具类型
        this.types = [
            { name: 'rapid_fire', color: '#ff6b6b', effect: 'rapid_fire', duration: 5000 }, // 快速射击
            { name: 'shield', color: '#4ecdc4', effect: 'shield', duration: 8000 }, // 护盾
            { name: 'score_boost', color: '#feca57', effect: 'score_boost', duration: 10000 }, // 分数加成
            { name: 'speed_boost', color: '#ff9ff3', effect: 'speed_boost', duration: 6000 } // 速度提升
        ];
        
        this.type = this.types[Math.floor(Math.random() * this.types.length)];
    }
    
    update() {
        this.y += this.speed;
    }
    
    render(ctx) {
        // 绘制道具主体
        ctx.fillStyle = this.type.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        
        // 绘制道具图标
        ctx.fillStyle = '#fff';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // 根据道具类型绘制不同图标
        let icon = '';
        switch(this.type.name) {
            case 'rapid_fire':
                icon = '⚡';
                break;
            case 'shield':
                icon = '🛡️';
                break;
            case 'score_boost':
                icon = '⭐';
                break;
            case 'speed_boost':
                icon = '💨';
                break;
        }
        
        ctx.fillText(icon, this.x + this.width / 2, this.y + this.height / 2);
    }
}

// 音效管理器类
class SoundManager {
    constructor() {
        this.audioContext = null;
        this.sounds = {};
        this.isMuted = false;
        this.volume = 0.5;
    }
    
    // 初始化音频上下文
    init() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.log('Web Audio API not supported');
        }
    }
    
    // 生成并播放射击音效
    playShoot() {
        if (!this.audioContext || this.isMuted) return;
        
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(400, this.audioContext.currentTime + 0.1);
        
        gainNode.gain.setValueAtTime(0.1 * this.volume, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);
        
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + 0.1);
    }
    
    // 生成并播放爆炸音效
    playExplosion() {
        if (!this.audioContext || this.isMuted) return;
        
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(500, this.audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(100, this.audioContext.currentTime + 0.3);
        
        gainNode.gain.setValueAtTime(0.2 * this.volume, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
        
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + 0.3);
    }
    
    // 生成并播放游戏结束音效
    playGameOver() {
        if (!this.audioContext || this.isMuted) return;
        
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(300, this.audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(150, this.audioContext.currentTime + 1);
        
        gainNode.gain.setValueAtTime(0.1 * this.volume, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 1);
        
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + 1);
    }
    
    // 设置音量
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
    }
    
    // 设置静音状态
    setMuted(muted) {
        this.isMuted = muted;
    }
    
    // 生成并播放收集道具音效
    playCollect() {
        if (!this.audioContext || this.isMuted) return;
        
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(800, this.audioContext.currentTime + 0.2);
        
        gainNode.gain.setValueAtTime(0.1 * this.volume, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);
        
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + 0.2);
    }
}

// 初始化游戏
window.addEventListener('DOMContentLoaded', () => {
    new Game();
});