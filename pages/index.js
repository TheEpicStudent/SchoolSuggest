fetch('/schoolname')
    .then(response => response.text())
    .then(data => {
        const schoolNames = document.getElementsByClassName('school-name');
        for (let i = 0; i < schoolNames.length; i++) {
            schoolNames[i].innerText = data;
        }
    });


function clearFeed() {
    const feed = document.querySelector('.feed');
    for (let i = feed.children.length - 1; i >= 0; i--) {
        feed.removeChild(feed.children[i]);
    }
}

function sortPosts(order) {
    clearFeed();
    if (checkAuth() == false) {
        return Promise.resolve([]);
    } else {
    document.getElementById('newest').classList.remove('highlighted');
    document.getElementById('oldest').classList.remove('highlighted');
    document.getElementById('mostupvoted').classList.remove('highlighted');
    document.getElementById('leastupvoted').classList.remove('highlighted');
    document.getElementById(order).classList.add('highlighted');
    fetch(`/posts?order=${order}`)
        .then(response => response.json())
        .then(posts => {
            posts.forEach(post => {
                if (post.hidden == 1) {
                    
                } else {
                addPost(post.User, post.Name, post.Detail, post.Date, post.Votes, post.PostID);
                }
            });
        })
        .catch(err => {
            console.error('Failed to load posts:', err);
        });
    }
}

document.getElementById('newest').addEventListener('click', () => sortPosts('newest'));
document.getElementById('oldest').addEventListener('click', () => sortPosts('oldest'));
document.getElementById('mostupvoted').addEventListener('click', () => sortPosts('mostupvoted'));
document.getElementById('leastupvoted').addEventListener('click', () => sortPosts('leastupvoted'));

// Manual post addition only client side
function addPost(author, title, content, date, votes, postID, feed) {
    date = new Date(date).toLocaleDateString();
    if (feed === undefined) {
        feed = document.querySelector('.feed');
        var dwhdu = '';
    } else if (feed === 'sticky') {
        feed = document.querySelector('.sticky-feed');
        var dwhdu = '<b>Sticky Post</b><button class="small-button" style="width: 50px; margin-top: 5px;" onclick="document.querySelector(\'.sticky-feed\').style.display = \'none\'">[HIDE]</button><br>';
    } else {
        feed = document.querySelector('.feed');
        var dwhdu = '';
    }
    const post = document.createElement('div');
    votes = votes.toString();
    votes = votes.replace('.0', '');
    post.className = 'post';
    post.innerHTML = `
            <div class="post-header">
                ${dwhdu}
                <span class="post-author">${author}</span>
                <span class="post-date">${date}</span>
                <span class="post-date">Post ${postID}</span>
            </div>
            <h2>${title}</h2>
            <p>${content}</p>
            <br>
            <div class="post-footer">
                <button onclick="votePost(${postID}, 'up')" id="upvote-${postID}">^</button>
                <span id="vote-count-${postID}">${votes}</span>
                <button onclick="votePost(${postID}, 'down')" id="downvote-${postID}">v</button>
            </div>
            <div class="post-footer">
                <button onclick="window.location.href = '/post/${postID}'">View Replies</button>
            </div>
    `;
    feed.appendChild(post);
    var local = localStorage.getItem(`voted_${postID}`)
    if (local) {
        document.getElementById(`${local}vote-${postID}`).className = 'highlighted'
    }
}

function stuck() {
    if (checkAuth() == false) {
        return;
    }

    fetch('/stuck')
        .then(response => response.json())
        .then(data => {
                fetch(`/postdata/${data.list[0]}`)
                    .then(response => response.json())
                    .then(data => {
                        addPost(data.post.User, data.post.Name, data.post.Detail, data.post.Date, data.post.Votes, data.post.PostID, 'sticky');
                    })
                    .catch(err => {
                        console.error('Failed to load sticky post data:', err);
                    }); 
        })
        .catch(err => {
            console.error('Failed to check stuck status:', err);
        });
}

stuck();

function votePost(postID, voteType) {
    if (localStorage.getItem(`voted_${postID}`)) {
        if (localStorage.getItem(`voted_${postID}`)) {
            if (localStorage.getItem(`voted_${postID}`) === 'up') { var reverse = 'down'; } else { var reverse = 'up'; }
            fetch('/vote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `postID=${postID}&voteType=${reverse}`
            }).catch(err => {
                console.error('Failed to remove vote:', err);
            });
            document.getElementById(`vote-count-${postID}`).innerText = parseInt(document.getElementById(`vote-count-${postID}`).innerText) + (localStorage.getItem(`voted_${postID}`) === 'up' ? -1 : 1);
            localStorage.removeItem(`voted_${postID}`);
            document.getElementById(`upvote-${postID}`).className = '';
            document.getElementById(`downvote-${postID}`).className = '';
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
    document.getElementById(`vote-count-${postID}`).innerText = parseInt(document.getElementById(`vote-count-${postID}`).innerText) + (voteType === 'up' ? 1 : -1);
    localStorage.setItem(`voted_${postID}`, voteType);
    document.getElementById(`${voteType}vote-${postID}`).className = 'highlighted';
}

function getPosts() {
    if (checkAuth() == false) {
        return Promise.resolve([]);
    } else {
    return fetch('/posts')
        .then(response => response.json())
        .catch(err => {
            console.error('Failed to load posts:', err);
            return [];
        });
    }
}

getPosts().then(posts => {
    posts.forEach(post => {
        if (post.hidden == 1) {
            
        } else {
        addPost(post.User, post.Name, post.Detail, post.Date, post.Votes, post.PostID);
        }
    });
    sortPosts('mostupvoted');
});

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

if (checkAuth()) {
    document.getElementById('loginbtn').style.display = 'none';
    document.getElementById('submitpost').style.display = 'inline-block';
    document.getElementById('sc').style.display = 'none';
} else {
    document.getElementById('loginbtn').style.display = 'inline-block';
    document.getElementById('submitpost').style.display = 'none';
    document.getElementsByClassName('option')[0].style.display = 'none';
    document.getElementById('logoutbtn').style.display = 'none';
}

function addAdvert(author, title, content, picture) {
    const feed = document.querySelector('.feed');
    const post = document.createElement('div');
    post.className = 'post';
    post.style = `align-items: stretch;justify-content: center;display: flex;flex-direction: column;`
    post.innerHTML = `
            <div class="post-header">
                <span class="post-author">${author}</span>
                <span class="post-date">(Advertisment)</span>
            </div>
            <h2>${title}</h2>
            <p>${content}</p>
            <br>
            <img src="${picture}" alt="Advert Image" style="max-width: 75%; height: auto; align-self: center; border: 2px solid #333; border-radius: 5px;">
    `;
    feed.appendChild(post);
    
}

async function loadAdverts() {
    try {
        const response = await fetch('/adverts/0');
        return await response.json();
    } catch (err) {
        console.error('Failed to load adverts:', err);
        return [];
    }
}


loadAdverts().then(adverts => {
    adverts.forEach(advert => {
        addAdvert(advert.Poster, advert.Title, advert.Detail, advert.ImageURL);
    });
});

if (window.location.hash === '#popup1') {
    document.getElementById('popup').style.display = 'block';
    document.getElementById('popuph1').style.display = 'block';
    document.getElementById('popupdetail').style.display = 'block';
    document.getElementById('popuph1').innerText = 'Thanks for registering!';
    document.getElementById('popupdetail').innerText = 'Your account has been created successfully. Please log in to start posting and voting on suggestions.';
}