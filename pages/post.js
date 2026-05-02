function loadPost(postID) {
    fetch(`/postdata/${postID}`)
        .then(response => response.json())
        .then(data => {
            document.getElementById('post-title').textContent = data.post.Name;
            document.getElementById('post-body').textContent = data.post.Detail;
            document.getElementById('post-author').textContent = data.post.User;
            document.getElementById('post-date').textContent = data.post.Date;
            var votes = data.post.Votes;
            votes = votes.toString();
            votes = votes.replace('.0', '');
            document.querySelector('#vote-count').innerHTML = votes;

            const repliesContainer = document.getElementById('actual');
            repliesContainer.innerHTML = '';
            
            if (data.replies.length === 0) {
                const noReplies = document.createElement('div');
                noReplies.className = 'reply';
                noReplies.textContent = 'No replies yet. Go on, start a discussion!';
                repliesContainer.appendChild(noReplies);
                return;
            }
            data.replies.forEach(reply => {
                const repliesData = reply.repliesJSON ? JSON.parse(reply.repliesJSON) : [reply];
                repliesData.forEach(replyItem => {
                    const replyElement = document.createElement('div');
                    replyElement.className = 'reply';
                    replyElement.innerHTML = `
                        <sub><b>${replyItem.username}</b></sub>
                        <p>${replyItem.content}</p>
                    `;
                    repliesContainer.appendChild(replyElement);
                });
            });
        })
        .catch(error => {
            console.error('[ERROR] Failed to load post data:', error);
        });
}

loadPost(window.location.pathname.split('/').pop());


function submitReply() {
    fetch('/reply', {
        method : "POST",
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `postID=${window.location.pathname.split('/').pop()}&authID=${localStorage.getItem('authToken')}&content=${encodeURIComponent(document.getElementById('replytext').value)}`
    })
    .then(response => {
        if (response.ok) {
            loadPost(window.location.pathname.split('/').pop());
            document.getElementById('replytext').value = '';
            location.reload();
        } else {
            console.error('Failed to submit reply');
        }
    })
    .catch(error => {
        console.error('Error submitting reply:', error);
    });
}

function checkAuth() {
    if (!localStorage.getItem('authToken')) {
        return false;
    } else {
        fetch('/auth/validate?token=' + localStorage.getItem('authToken'))
            .then(response => response.json())
            .then(data => {
                if (!data.valid) {
                    localStorage.removeItem('authToken');
                    return false;
                } else {
                    return true;
                }
            })
            .catch(err => {
                console.error('Auth validation failed:', err);
                localStorage.removeItem('authToken');
            });
        return true;
    }
}

if (checkAuth() == false) {
    window.location.href = '/'
}

function votePost(postID, voteType) {
    if (localStorage.getItem(`voted_${postID}`)) {
        if (localStorage.getItem(`voted_${postID}`) === voteType) {
            if (voteType === 'up') { var reverse = 'down'; } else { var reverse = 'up'; }
            fetch('/vote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `postID=${postID}&voteType=${reverse}`
            }).catch(err => {
                console.error('Failed to remove vote:', err);
            });
            document.getElementById(`vote-count`).innerText = parseInt(document.getElementById(`vote-count`).innerText) + (voteType === 'up' ? -1 : 1);
            localStorage.removeItem(`voted_${postID}`);
            return;
        }
    }
    fetch('/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `postID=${postID}&voteType=${voteType}`
    }).catch(err => {
        console.error('Failed to submit vote:', err);
    });
    document.getElementById(`vote-count`).innerText = parseInt(document.getElementById(`vote-count`).innerText) + (voteType === 'up' ? 1 : -1);
    localStorage.setItem(`voted_${postID}`, voteType);
}