
            // Hide notifications UI when localMode=true
            (function () {
                try {
                    if (window.HUB_CONFIG && window.HUB_CONFIG.localMode) {
                        document.documentElement.classList.add('hub-localmode');
                    }
                } catch (e) { }
            })();
