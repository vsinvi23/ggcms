package http

import (
	"github.com/gin-gonic/gin"
	analyticssvc "github.com/serenya/go-cms/internal/application/analytics"
	auditsvc "github.com/serenya/go-cms/internal/application/audit"
	authsvc "github.com/serenya/go-cms/internal/application/auth"
	categorysvc "github.com/serenya/go-cms/internal/application/category"
	cmssvc "github.com/serenya/go-cms/internal/application/cms"
	commentsvc "github.com/serenya/go-cms/internal/application/comment"
	ctsvc "github.com/serenya/go-cms/internal/application/contenttype"
	engagementsvc "github.com/serenya/go-cms/internal/application/engagement"
	enrollmentsvc "github.com/serenya/go-cms/internal/application/enrollment"
	groupsvc "github.com/serenya/go-cms/internal/application/group"
	lpsvc "github.com/serenya/go-cms/internal/application/learningpath"
	personalizationsvc "github.com/serenya/go-cms/internal/application/personalization"
	lessonsvc "github.com/serenya/go-cms/internal/application/lesson"
	notificationsvc "github.com/serenya/go-cms/internal/application/notification"
	oauthsvc "github.com/serenya/go-cms/internal/application/oauth"
	sectionsvc "github.com/serenya/go-cms/internal/application/section"
	settingssvc "github.com/serenya/go-cms/internal/application/settings"
	tagsvc "github.com/serenya/go-cms/internal/application/tag"
	tasksvc "github.com/serenya/go-cms/internal/application/task"
	usersvc "github.com/serenya/go-cms/internal/application/user"
	gqlhandler "github.com/serenya/go-cms/internal/interfaces/graphql"
	"github.com/serenya/go-cms/internal/interfaces/http/handler"
	"github.com/serenya/go-cms/internal/interfaces/http/middleware"
	"github.com/serenya/go-cms/pkg/config"
	jwtpkg "github.com/serenya/go-cms/pkg/jwt"
)

// Services groups all application service interfaces needed by the router.
type Services struct {
	Auth         authsvc.Service
	User         usersvc.Service
	Group        groupsvc.Service
	Category     categorysvc.Service
	CMS          cmssvc.Service
	Section      sectionsvc.Service
	Lesson       lessonsvc.Service
	Enrollment   enrollmentsvc.Service
	Task         tasksvc.Service
	Notification notificationsvc.Service
	Comment      commentsvc.Service
	Analytics    analyticssvc.Service
	Tag          tagsvc.Service
	Reaction     engagementsvc.ReactionService
	Note         engagementsvc.NoteService
	Favourite    engagementsvc.FavouriteService
	Highlight    engagementsvc.HighlightService
	ContentType  ctsvc.Service
	LearningPath lpsvc.Service
	Audit           auditsvc.Service
	OAuth           oauthsvc.Service
	Settings        settingssvc.Service
	Personalization personalizationsvc.Service
}

// NewRouter wires all services to handlers and returns a configured Gin engine.
func NewRouter(cfg *config.Config, jwtManager *jwtpkg.Manager, svcs Services) (*gin.Engine, error) {
	gin.SetMode(cfg.Server.GinMode)

	r := gin.New()
	r.Use(middleware.Logger())
	r.Use(middleware.CORS())
	r.Use(gin.Recovery())
	// Attach audit service to every request context so handlers can call middleware.LogAudit
	r.Use(middleware.AuditMiddleware(svcs.Audit))

	// Serve uploaded files statically
	r.Static("/uploads", cfg.Upload.Dir)

	// GraphQL endpoint (public — for content browsing)
	gql, err := gqlhandler.NewHandler(svcs.CMS, svcs.Category)
	if err != nil {
		return nil, err
	}
	r.POST("/graphql", gql.Handle)

	// Initialise all HTTP handlers
	authH := handler.NewAuthHandler(svcs.Auth)
	oauthH := handler.NewOAuthHandler(svcs.OAuth, cfg.OAuth.FrontendURL)
	userH := handler.NewUserHandler(svcs.User)
	groupH := handler.NewGroupHandler(svcs.Group)
	catH := handler.NewCategoryHandler(svcs.Category)
	cmsH := handler.NewCMSHandler(svcs.CMS, svcs.Task)
	secH := handler.NewSectionHandler(svcs.Section)
	lesH := handler.NewLessonHandler(svcs.Lesson)
	enrH := handler.NewEnrollmentHandler(svcs.Enrollment)
	taskH := handler.NewTaskHandler(svcs.Task)
	notifH := handler.NewNotificationHandler(svcs.Notification)
	commH := handler.NewCommentHandler(svcs.Comment)
	mediaH := handler.NewMediaHandler(cfg.Upload, svcs.Settings)
	settingsH := handler.NewSettingsHandler(svcs.Settings)
	pubH := handler.NewPublicHandler(svcs.CMS, svcs.Category, svcs.Analytics)
	analyticsH := handler.NewAnalyticsHandler(svcs.Analytics)
	tagH := handler.NewTagHandler(svcs.Tag)
	engH := handler.NewEngagementHandler(svcs.Reaction, svcs.Note, svcs.Favourite, svcs.Highlight)
	ctH := handler.NewContentTypeHandler(svcs.ContentType)
	lpH := handler.NewLearningPathHandler(svcs.LearningPath)
	auditH := handler.NewAuditHandler(svcs.Audit)
	personH := handler.NewPersonalizationHandler(svcs.Personalization)
	importH := handler.NewImportHandler(svcs.CMS, svcs.Task)

	authMW := middleware.Auth(jwtManager)

	api := r.Group("/api")
	{
		// ----- Auth (public) — email/password -----
		api.POST("/auth/local", middleware.AuthRateLimit(), authH.Login)
		api.POST("/auth/local/register", middleware.AuthRateLimit(), authH.Register)

		// ----- Auth (public) — OAuth social login -----
		api.GET("/auth/google", oauthH.GoogleRedirect)
		api.GET("/auth/google/callback", oauthH.GoogleCallback)
		api.GET("/auth/github", oauthH.GitHubRedirect)
		api.GET("/auth/github/callback", oauthH.GitHubCallback)

		// ----- Feature flags (public — no auth) -----
		api.GET("/features", settingsH.GetFeatures)

		// ----- Content types (public read) -----
		api.GET("/content-types", ctH.GetAll)

		// ----- Tags (public read) -----
		api.GET("/tags", tagH.GetAll)

		// ----- Sections (public read — course curriculum preview) -----
		api.GET("/sections", secH.GetAll)

		// ----- Categories (public read) -----
		api.GET("/categories", catH.GetAll)
		api.GET("/categories/:id", catH.GetByID)

		// ----- Learning paths (public read) -----
		api.GET("/learning-paths", lpH.GetAll)
		api.GET("/learning-paths/:id", lpH.GetByID)

		// ----- Review comments (public read, protected write) -----
		api.GET("/review-comments", commH.GetByContent)
		api.GET("/review-comments/:id/replies", commH.ListReplies)

		// ----- Public content (no auth) -----
		pub := api.Group("/public")
		{
			pub.GET("/articles", pubH.GetPublicArticles)
			pub.GET("/articles/category/:slug", pubH.GetPublicArticlesByCategory)
			pub.GET("/articles/:id", pubH.GetPublicArticle)
			pub.GET("/courses", pubH.GetPublicCourses)
			pub.GET("/courses/category/:slug", pubH.GetPublicCoursesByCategory)
			pub.GET("/courses/:id", pubH.GetPublicCourse)
			// Unified CMS endpoint (type=ARTICLE|COURSE)
			pub.GET("/cms", pubH.GetPublicCMS)
			pub.GET("/cms/:id", pubH.GetPublicCMSByID)
		}

		// ----- Protected routes -----
		p := api.Group("/")
		p.Use(authMW)
		{
			// Current user
			p.GET("users/me", authH.Me)

			// Users — read: any authenticated user; write: admin only
			// PUT /users/:id is intentionally not AdminOnly — ownership check is in the handler
			p.GET("users", userH.GetAll)
			p.POST("users", middleware.AdminOnly(), userH.Create)
			p.GET("users/:id", userH.GetByID)
			p.GET("users/:id/groups", userH.GetGroups)
			p.PUT("users/:id", userH.Update)
			p.DELETE("users/:id", userH.Delete)
			p.POST("users/:id/activate", middleware.AdminOnly(), userH.Activate)
			p.POST("users/:id/deactivate", middleware.AdminOnly(), userH.Deactivate)

			// Groups — read: any authenticated user; write: admin only
			p.GET("user-groups", groupH.GetAll)
			p.GET("user-groups/:id", groupH.GetByID)
			p.POST("user-groups", middleware.AdminOnly(), groupH.Create)
			p.PUT("user-groups/:id", middleware.AdminOnly(), groupH.Update)
			p.DELETE("user-groups/:id", middleware.AdminOnly(), groupH.Delete)
			p.GET("user-groups/:id/members", groupH.GetMembers)
			p.POST("user-groups/:id/members", middleware.AdminOnly(), groupH.AddMember)
			p.DELETE("user-groups/:id/members/:userId", middleware.AdminOnly(), groupH.RemoveMember)
			p.GET("user-groups/:id/categories", catH.GetGroupCategories)

			// Categories — GET is public (see above); write operations are admin only
			p.POST("categories", middleware.AdminOnly(), catH.Create)
			p.PUT("categories/:id", middleware.AdminOnly(), catH.Update)
			p.DELETE("categories/:id", middleware.AdminOnly(), catH.Delete)
			p.GET("categories/:id/tags", tagH.GetCategoryTags)
			p.PUT("categories/:id/tags", middleware.AdminOnly(), tagH.SetCategoryTags)
			// Category reviewer group management (admin only)
			p.GET("categories/:id/reviewer-groups", catH.GetReviewerGroups)
			p.POST("categories/:id/reviewer-groups", middleware.AdminOnly(), catH.AddReviewerGroup)
			p.DELETE("categories/:id/reviewer-groups/:gid", middleware.AdminOnly(), catH.RemoveReviewerGroup)
			p.GET("categories/:id/reviewers", catH.GetReviewers)

			// Tags (GET is public — see above; only write operations require auth)
			p.POST("tags", tagH.Create)
			p.DELETE("tags/:id", tagH.Delete)

			// Content Types (admin only)
			p.POST("content-types", middleware.AdminOnly(), ctH.Create)
			p.PUT("content-types/:id", middleware.AdminOnly(), ctH.Update)
			p.DELETE("content-types/:id", middleware.AdminOnly(), ctH.Delete)

			// Learning Paths (admin only)
			p.POST("learning-paths", middleware.AdminOnly(), lpH.Create)
			p.PUT("learning-paths/:id", middleware.AdminOnly(), lpH.Update)
			p.DELETE("learning-paths/:id", middleware.AdminOnly(), lpH.Delete)
			p.PUT("learning-paths/:id/courses", middleware.AdminOnly(), lpH.SetCourses)

			// CMS (articles + courses unified)
			p.GET("cms", cmsH.GetAll)
			p.GET("cms/:id", cmsH.GetByID)
			p.POST("cms", cmsH.Create)
			p.PUT("cms/:id", cmsH.Update)
			p.DELETE("cms/:id", cmsH.Delete)
			p.POST("cms/:id/submit", cmsH.Submit)
			p.POST("cms/:id/approve", cmsH.Approve)
			p.POST("cms/:id/publish", cmsH.Publish)
			p.POST("cms/:id/send-back", cmsH.SendBack)
			p.POST("cms/:id/reject", cmsH.Reject)
			p.GET("cms/:id/activity", cmsH.GetActivity)
			p.POST("cms/:id/claim-review", cmsH.ClaimReview)
			p.POST("cms/:id/reassign-review", cmsH.ReassignReview)
			p.POST("cms/:id/review-note", cmsH.SaveReviewNote)
			p.POST("cms/:id/assign-reviewer", middleware.AdminOnly(), cmsH.AssignReviewer)

			// Sections (GET is public — see above; write operations require auth)
			p.POST("sections", secH.Create)
			p.PUT("sections/:id", secH.Update)
			p.DELETE("sections/:id", secH.Delete)

			// Lessons
			p.GET("lessons", lesH.GetAll)
			p.POST("lessons", lesH.Create)
			p.PUT("lessons/:id", lesH.Update)
			p.DELETE("lessons/:id", lesH.Delete)

			// Enrollments
			p.GET("enrollments", enrH.GetAll)
			p.POST("enrollments", enrH.Create)
			p.PUT("enrollments/:id", enrH.Update)

			// Tasks
			p.GET("tasks", taskH.GetAll)
			p.GET("tasks/:id", taskH.GetByID)
			p.POST("tasks", taskH.Create)
			p.PUT("tasks/:id", taskH.Update)
			p.DELETE("tasks/:id", taskH.Delete)

			// Notifications — register specific path before wildcard
			p.PATCH("notifications/read-all", notifH.MarkAllAsRead)
			p.GET("notifications", notifH.GetAll)
			p.PATCH("notifications/:id/read", notifH.MarkAsRead)

			// Review comments (write/delete only — GET is public above)
			p.POST("review-comments", commH.Create)
			p.DELETE("review-comments/:id", commH.Delete)

			// File upload
			p.POST("upload", mediaH.Upload)

			// Bulk import — preview parses files without writing; confirm creates DRAFTs
			p.POST("import/preview", importH.Preview)
			p.POST("import/confirm", importH.Confirm)

			// Analytics (admin only)
			p.GET("analytics/dashboard", middleware.AdminOnly(), analyticsH.GetDashboard)

			// Audit log (admin only) — GET /api/audit?action=&targetType=&page=0&size=20
			p.GET("audit", middleware.AdminOnly(), auditH.List)

			// Personalization — profile + recommendations
			p.GET("personalization/profile", personH.GetProfile)
			p.PUT("personalization/profile", personH.UpsertProfile)
			p.GET("personalization/profiles", personH.GetProfiles)
			p.POST("personalization/profiles", personH.CreateProfile)
			p.PUT("personalization/profiles/:id/activate", personH.ActivateProfile)
			p.GET("personalization/recommendations", personH.GetRecommendations)

			// App settings (admin only)
			p.GET("settings", middleware.AdminOnly(), settingsH.GetAll)
			p.PUT("settings", middleware.AdminOnly(), settingsH.Update)
			p.POST("settings/test-storage", middleware.AdminOnly(), settingsH.TestStorage)

			// Engagement (reactions, notes, favourites, highlights)
			eng := p.Group("engagement")
			{
				// Per-content reactions
				eng.POST(":contentType/:contentId/react", engH.React)
				eng.DELETE(":contentType/:contentId/react", engH.Unreact)
				eng.GET(":contentType/:contentId/reactions", engH.GetReactions)

				// Per-content notes
				eng.PUT(":contentType/:contentId/note", engH.UpsertNote)
				eng.GET(":contentType/:contentId/note", engH.GetNote)

				// User's notes list + delete
				eng.GET("notes", engH.ListMyNotes)
				eng.DELETE("notes/:id", engH.DeleteNote)

				// Per-content favourites
				eng.POST(":contentType/:contentId/favourite", engH.ToggleFavourite)
				eng.GET(":contentType/:contentId/favourite", engH.IsFavourited)

				// User's favourites list
				eng.GET("favourites", engH.ListMyFavourites)

				// Per-content highlights
				eng.POST(":contentType/:contentId/highlights", engH.CreateHighlight)
				eng.GET(":contentType/:contentId/highlights", engH.ListHighlights)

				// User's highlights list + delete + update
				eng.GET("highlights", engH.ListMyHighlights)
				eng.PUT("highlights/:id", engH.UpdateHighlight)
				eng.DELETE("highlights/:id", engH.DeleteHighlight)
			}
		}
	}

	return r, nil
}
