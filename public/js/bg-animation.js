// Dynamic Interactive Background Particles
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.createElement('canvas');
    canvas.id = 'bg-canvas';
    // Insert early but behind the navbar
    document.body.insertBefore(canvas, document.body.firstChild);
    
    const ctx = canvas.getContext('2d');
    let width, height;
    let particlesArray;
    
    // Mouse tracking
    let mouse = {
        x: null,
        y: null,
        radius: (window.innerWidth/80) * (window.innerHeight/80)
    };
    
    window.addEventListener('mousemove', (e) => {
        mouse.x = e.x;
        mouse.y = e.y;
    });
    
    window.addEventListener('mouseout', () => {
        mouse.x = null;
        mouse.y = null;
    });
    
    window.addEventListener('resize', () => {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
        mouse.radius = (width/80) * (height/80);
        init();
    });
    
    function init() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
        particlesArray = [];
        let numberOfParticles = (width * height) / 9000;
        
        // Dark mode adaptation
        const isDark = document.body.getAttribute('data-theme') === 'dark';
        
        for (let i = 0; i < numberOfParticles; i++) {
            let size = (Math.random() * 2) + 1;
            let x = (Math.random() * ((width - size * 2) - (size * 2)) + size * 2);
            let y = (Math.random() * ((height - size * 2) - (size * 2)) + size * 2);
            let directionX = (Math.random() * 2) - 1;
            let directionY = (Math.random() * 2) - 1;
            let color = isDark ? '#818cf8' : '#4F46E5';
            
            particlesArray.push(new Particle(x, y, directionX, directionY, size, color));
        }
    }
    
    class Particle {
        constructor(x, y, directionX, directionY, size, color) {
            this.x = x;
            this.y = y;
            this.directionX = directionX;
            this.directionY = directionY;
            this.size = size;
            this.color = color;
        }
        
        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2, false);
            ctx.fillStyle = this.color;
            ctx.fill();
        }
        
        update() {
            // Keep particles within screen bounds
            if (this.x > width || this.x < 0) this.directionX = -this.directionX;
            if (this.y > height || this.y < 0) this.directionY = -this.directionY;
            
            // Mouse collision checks
            let dx = mouse.x - this.x;
            let dy = mouse.y - this.y;
            let distance = Math.sqrt(dx*dx + dy*dy);
            
            if (distance < mouse.radius + this.size) {
                if (mouse.x < this.x && this.x < width - this.size * 10) this.x += 10;
                if (mouse.x > this.x && this.x > this.size * 10) this.x -= 10;
                if (mouse.y < this.y && this.y < height - this.size * 10) this.y += 10;
                if (mouse.y > this.y && this.y > this.size * 10) this.y -= 10;
            }
            
            this.x += this.directionX;
            this.y += this.directionY;
            
            this.draw();
        }
    }
    
    function connect() {
        let opacityValue = 1;
        for (let a = 0; a < particlesArray.length; a++) {
            for (let b = a; b < particlesArray.length; b++) {
                let distance = ((particlesArray[a].x - particlesArray[b].x) * (particlesArray[a].x - particlesArray[b].x)) 
                             + ((particlesArray[a].y - particlesArray[b].y) * (particlesArray[a].y - particlesArray[b].y));
                             
                if (distance < (width/7) * (height/7)) {
                    opacityValue = 1 - (distance/20000);
                    let color = document.body.getAttribute('data-theme') === 'dark' 
                        ? `rgba(129, 140, 248, ${opacityValue})` 
                        : `rgba(79, 70, 229, ${opacityValue * 0.4})`;
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(particlesArray[a].x, particlesArray[a].y);
                    ctx.lineTo(particlesArray[b].x, particlesArray[b].y);
                    ctx.stroke();
                }
            }
        }
    }
    
    function animate() {
        requestAnimationFrame(animate);
        ctx.clearRect(0, 0, width, height);
        
        for (let i = 0; i < particlesArray.length; i++) {
            particlesArray[i].update();
        }
        connect();
    }
    
    init();
    animate();
});
