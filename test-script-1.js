
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        brand: {
                            red: '#D32F2F',
                            cp: '#c1621e',
                            dark: '#1a1a1a',
                            gray: '#f3f4f6',
                            light: '#ffffff'
                        }
                    },
                    fontFamily: {
                        sans: ['"Segoe UI"', 'sans-serif']
                    },
                    animation: {
                        'enter': 'enter 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)',
                        'float': 'float 6s ease-in-out infinite',
                    },
                    keyframes: {
                        enter: {
                            '0%': { opacity: '0', transform: 'translateY(20px) scale(0.95)' },
                            '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
                        },
                        float: {
                            '0%, 100%': { transform: 'translateY(0)' },
                            '50%': { transform: 'translateY(-10px)' },
                        }
                    }
                }
            }
        }
